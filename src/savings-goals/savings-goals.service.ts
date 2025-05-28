import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { AddFundsDto, CreateSavingsGoalDto, UpdateSavingsGoalDto } from './dto';

@Injectable()
export class SavingsGoalsService {
  constructor(private prisma: PrismaService) {}

  // Get all goals for a user with optional status filter
  async getGoals(userId: string, status?: 'active' | 'completed') {
    const whereClause: any = { userId };
    
    if (status === 'active') {
      whereClause.completed = false;
    } else if (status === 'completed') {
      whereClause.completed = true;
    }

    const goals = await this.prisma.savingsGoal.findMany({
      where: whereClause,
      orderBy: { createdAt: 'desc' },
    });

    // Add additional calculated fields
    return goals.map(goal => {
      const progressPercentage = goal.targetAmount > 0 
        ? Math.min(100, (goal.currentAmount / goal.targetAmount) * 100) 
        : 0;
      
      const daysRemaining = goal.targetDate 
        ? Math.max(0, Math.ceil((new Date(goal.targetDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24))) 
        : null;

      return {
        ...goal,
        progressPercentage,
        daysRemaining,
      };
    });
  }

  // Create a new savings goal
  async createGoal(userId: string, dto: CreateSavingsGoalDto) {
    try {
      const goal = await this.prisma.savingsGoal.create({
        data: {
          userId,
          name: dto.name,
          targetAmount: dto.targetAmount,
          currentAmount: dto.currentAmount || 0,
          targetDate: dto.targetDate,
          notes: dto.notes,
          completed: false,
        },
      });

      const progressPercentage = goal.targetAmount > 0 
        ? Math.min(100, (goal.currentAmount / goal.targetAmount) * 100) 
        : 0;
      
      const daysRemaining = goal.targetDate 
        ? Math.max(0, Math.ceil((new Date(goal.targetDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24))) 
        : null;

      return {
        ...goal,
        progressPercentage,
        daysRemaining,
      };
    } catch (error) {
      throw error;
    }
  }

  // Update an existing savings goal
  async updateGoal(userId: string, goalId: string, dto: UpdateSavingsGoalDto) {
    // Check if goal exists and belongs to the user
    await this.verifyOwnership(userId, goalId);

    // Update the goal
    const updatedGoal = await this.prisma.savingsGoal.update({
      where: { id: goalId },
      data: {
        ...(dto.name && { name: dto.name }),
        ...(dto.targetAmount && { targetAmount: dto.targetAmount }),
        ...(dto.targetDate && { targetDate: dto.targetDate }),
        ...(dto.notes !== undefined && { notes: dto.notes }),
      },
    });

    const progressPercentage = updatedGoal.targetAmount > 0 
      ? Math.min(100, (updatedGoal.currentAmount / updatedGoal.targetAmount) * 100) 
      : 0;
    
    const daysRemaining = updatedGoal.targetDate 
      ? Math.max(0, Math.ceil((new Date(updatedGoal.targetDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24))) 
      : null;

    return {
      ...updatedGoal,
      progressPercentage,
      daysRemaining,
    };
  }

  // Delete a savings goal
  async deleteGoal(userId: string, goalId: string) {
    // Check if goal exists and belongs to the user
    await this.verifyOwnership(userId, goalId);

    // Delete the goal
    await this.prisma.savingsGoal.delete({
      where: { id: goalId },
    });

    return { message: 'Goal deleted successfully' };
  }

  // Add funds to a savings goal
  async addFunds(userId: string, goalId: string, dto: AddFundsDto) {
    // Check if goal exists and belongs to the user
    const goal = await this.verifyOwnership(userId, goalId);

    // Check if goal is already completed
    if (goal.completed) {
      throw new ForbiddenException('Cannot add funds to a completed goal');
    }

    // Use transaction to ensure both operations succeed or fail together
    const result = await this.prisma.$transaction(async (prisma) => {
      // Update the current amount in savings goal
      const newAmount = goal.currentAmount + dto.amount;
      const isCompleted = newAmount >= goal.targetAmount;

      const updatedGoal = await prisma.savingsGoal.update({
        where: { id: goalId },
        data: {
          currentAmount: newAmount,
          completed: isCompleted,
        },
      });

      // Create or update savings plan item to sync with dashboard
      const planItemDescription = `Savings: ${goal.name}`;
      
      // Check if there's already a savings plan item for current month
      const currentDate = new Date();
      const currentMonthPlan = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}`;
      
      const existingSavingsItem = await prisma.planItem.findFirst({
        where: {
          userId,
          itemType: 'SAVINGS',
          planType: currentMonthPlan,
          description: { contains: goal.name },
        },
      });

      if (existingSavingsItem) {
        // Update existing plan item by adding the new amount
        await prisma.planItem.update({
          where: { id: existingSavingsItem.id },
          data: {
            amount: existingSavingsItem.amount + dto.amount,
            notes: `${existingSavingsItem.notes || ''}\nAdded $${dto.amount} on ${new Date().toISOString().split('T')[0]}`,
            updatedAt: new Date(),
          },
        });
      } else {
        // Create new savings plan item
        await prisma.planItem.create({
          data: {
            userId,
            description: planItemDescription,
            amount: dto.amount,
            notes: `Funds added to ${goal.name}`,
            planType: currentMonthPlan,
            itemType: 'SAVINGS',
          },
        });
      }

      return updatedGoal;
    });

    const progressPercentage = result.targetAmount > 0 
      ? Math.min(100, (result.currentAmount / result.targetAmount) * 100) 
      : 0;
    
    const daysRemaining = result.targetDate 
      ? Math.max(0, Math.ceil((new Date(result.targetDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24))) 
      : null;

    return {
      ...result,
      progressPercentage,
      daysRemaining,
    };
  }

  // Mark a goal as completed
  async completeGoal(userId: string, goalId: string) {
    // Check if goal exists and belongs to the user
    const goal = await this.verifyOwnership(userId, goalId);

    // Check if goal is already completed
    if (goal.completed) {
      throw new ForbiddenException('Goal is already completed');
    }

    // Mark the goal as completed
    const completedGoal = await this.prisma.savingsGoal.update({
      where: { id: goalId },
      data: { completed: true },
    });

    const progressPercentage = completedGoal.targetAmount > 0 
      ? Math.min(100, (completedGoal.currentAmount / completedGoal.targetAmount) * 100) 
      : 0;

    return {
      ...completedGoal,
      progressPercentage,
      daysRemaining: 0,
    };
  }

  // Helper method to verify ownership
  private async verifyOwnership(userId: string, goalId: string) {
    const goal = await this.prisma.savingsGoal.findUnique({
      where: { id: goalId },
    });

    if (!goal) {
      throw new NotFoundException('Goal not found');
    }

    if (goal.userId !== userId) {
      throw new ForbiddenException('Access to resource denied');
    }

    return goal;
  }
} 