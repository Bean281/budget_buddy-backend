import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiQuery, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { JwtGuard } from 'src/auth/guard';
import { GetUser } from 'src/auth/decorator';
import { DashboardService } from './dashboard.service';
import { BudgetPeriodEnum, BudgetProgressParamsDto, RecentExpensesParamsDto } from './dto/dashboard-params.dto';
import { FinancialSummaryModel, TodaySpendingModel, BudgetProgressModel, RecentExpensesModel } from './models/dashboard.model';
import { ParseDatePipe } from 'src/transactions/pipes/parse-date.pipe';

@ApiTags('dashboard')
@ApiBearerAuth('JWT-auth')
@ApiUnauthorizedResponse({ description: 'Unauthorized - JWT token is missing or invalid' })
@UseGuards(JwtGuard)
@Controller('api/dashboard')
export class DashboardController {
  constructor(private dashboardService: DashboardService) {}

  /**
   * Get financial summary
   * 
   * @param userId - Current authenticated user ID
   * @param fromDate - Optional start date for filtering
   * @param toDate - Optional end date for filtering
   * @returns Financial summary data
   */
  @Get('summary')
  @ApiOperation({
    summary: 'Get financial summary',
    description: 'Retrieves financial summary for the current user',
  })
  @ApiQuery({
    name: 'fromDate',
    required: false,
    type: String,
    description: 'Start date for filtering (ISO format)',
  })
  @ApiQuery({
    name: 'toDate',
    required: false,
    type: String,
    description: 'End date for filtering (ISO format)',
  })
  @ApiOkResponse({
    description: 'Financial summary retrieved successfully',
    type: FinancialSummaryModel,
  })
  getFinancialSummary(
    @GetUser('id') userId: string,
    @Query('fromDate', ParseDatePipe) fromDate?: Date,
    @Query('toDate', ParseDatePipe) toDate?: Date,
  ) {
    return this.dashboardService.getFinancialSummary(userId, fromDate, toDate);
  }

  /**
   * Get today's spending
   * 
   * @param userId - Current authenticated user ID
   * @returns Today's spending data
   */
  @Get('today')
  @ApiOperation({
    summary: "Get today's spending",
    description: 'Retrieves spending information for the current day',
  })
  @ApiOkResponse({
    description: "Today's spending data retrieved successfully",
    type: TodaySpendingModel,
  })
  getTodaySpending(
    @GetUser('id') userId: string,
  ) {
    return this.dashboardService.getTodaySpending(userId);
  }

  /**
   * Get budget progress
   * 
   * @param userId - Current authenticated user ID
   * @param params - Budget progress parameters
   * @returns Budget progress data
   */
  @Get('budget-progress')
  @ApiOperation({
    summary: 'Get budget progress',
    description: 'Retrieves budget progress for a specific period',
  })
  @ApiQuery({
    name: 'period',
    required: true,
    enum: BudgetPeriodEnum,
    description: 'Budget period type',
  })
  @ApiOkResponse({
    description: 'Budget progress data retrieved successfully',
    type: BudgetProgressModel,
  })
  getBudgetProgress(
    @GetUser('id') userId: string,
    @Query() params: BudgetProgressParamsDto,
  ) {
    return this.dashboardService.getBudgetProgress(userId, params.period);
  }

  /**
   * Get recent expenses
   * 
   * @param userId - Current authenticated user ID
   * @param params - Recent expenses parameters
   * @returns Recent expenses data
   */
  @Get('recent-expenses')
  @ApiOperation({
    summary: 'Get recent expenses',
    description: 'Retrieves recent expense transactions',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Maximum number of expenses to return',
  })
  @ApiOkResponse({
    description: 'Recent expenses retrieved successfully',
    type: RecentExpensesModel,
  })
  getRecentExpenses(
    @GetUser('id') userId: string,
    @Query() params: RecentExpensesParamsDto,
  ) {
    return this.dashboardService.getRecentExpenses(userId, params.limit);
  }
}
