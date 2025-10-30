#!/usr/bin/env python3
"""
Script to display all database tables with their data.
Usage: python print_all_tables.py
"""

import asyncio
import sys
from datetime import datetime
from typing import List
from uuid import UUID

# Add the backend app to path
sys.path.insert(0, "/Users/vaibhavchauhan/Desktop/ai-interview/backend")

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import func, inspect

from app.core.database import async_session_maker, init_db
from app.models.user import User
from app.models.company import Company
from app.models.role import Role
from app.models.interview import Interview
from app.models.score import Score
from app.models.audit_log import AuditLog


class Colors:
    """ANSI color codes for terminal output."""
    HEADER = '\033[95m'
    OKBLUE = '\033[94m'
    OKCYAN = '\033[96m'
    OKGREEN = '\033[92m'
    WARNING = '\033[93m'
    FAIL = '\033[91m'
    ENDC = '\033[0m'
    BOLD = '\033[1m'
    UNDERLINE = '\033[4m'


def format_table_separator(col_widths: List[int]) -> str:
    """Create a table separator line."""
    return "+" + "+".join("-" * (width + 2) for width in col_widths) + "+"


def format_table_row(values: List[str], col_widths: List[int], is_header: bool = False) -> str:
    """Format a single table row."""
    formatted_values = []
    for value, width in zip(values, col_widths):
        formatted_values.append(str(value).ljust(width))
    
    row = "| " + " | ".join(formatted_values) + " |"
    
    if is_header:
        row = Colors.BOLD + row + Colors.ENDC
    
    return row


def truncate_value(value, max_width: int = 25) -> str:
    """Truncate value to max width."""
    if value is None:
        return "NULL"
    value_str = str(value)
    if len(value_str) > max_width:
        return value_str[:max_width-3] + "..."
    return value_str


async def print_companies_table(session: AsyncSession):
    """Print companies table."""
    print(f"\n{Colors.HEADER}{Colors.BOLD}=== COMPANIES TABLE ==={Colors.ENDC}\n")
    
    result = await session.execute(select(Company))
    companies = result.scalars().all()
    
    if not companies:
        print(f"{Colors.WARNING}No companies found.{Colors.ENDC}\n")
        return
    
    col_widths = [8, 20, 20, 30, 20, 15]
    separator = format_table_separator(col_widths)
    
    print(separator)
    headers = ["ID", "Name", "Email Domain", "Description", "Created At", "Active"]
    print(format_table_row(headers, col_widths, is_header=True))
    print(separator)
    
    for company in companies:
        values = [
            str(company.id)[:8],
            truncate_value(company.name, 20),
            truncate_value(company.email_domain, 20),
            truncate_value(company.description, 30),
            company.created_at.strftime('%Y-%m-%d') if company.created_at else "N/A",
            "Yes" if company.is_active else "No",
        ]
        print(format_table_row(values, col_widths))
    
    print(separator)
    print(f"Total: {Colors.OKGREEN}{len(companies)}{Colors.ENDC} companies\n")


async def print_users_table(session: AsyncSession):
    """Print users table."""
    print(f"\n{Colors.HEADER}{Colors.BOLD}=== USERS TABLE ==={Colors.ENDC}\n")
    
    result = await session.execute(select(User))
    users = result.scalars().all()
    
    if not users:
        print(f"{Colors.WARNING}No users found.{Colors.ENDC}\n")
        return
    
    col_widths = [8, 15, 20, 15, 12, 12, 12]
    separator = format_table_separator(col_widths)
    
    print(separator)
    headers = ["ID", "Name", "Email", "Role", "Company", "Department", "Active"]
    print(format_table_row(headers, col_widths, is_header=True))
    print(separator)
    
    for user in users:
        values = [
            str(user.id)[:8],
            truncate_value(user.name, 15),
            truncate_value(user.email, 20),
            user.role.value,
            str(user.company_id)[:12],
            truncate_value(user.department, 12),
            "Yes" if user.is_active else "No",
        ]
        print(format_table_row(values, col_widths))
    
    print(separator)
    print(f"Total: {Colors.OKGREEN}{len(users)}{Colors.ENDC} users\n")


async def print_roles_table(session: AsyncSession):
    """Print custom roles table."""
    print(f"\n{Colors.HEADER}{Colors.BOLD}=== CUSTOM ROLES TABLE ==={Colors.ENDC}\n")
    
    result = await session.execute(select(Role))
    roles = result.scalars().all()
    
    if not roles:
        print(f"{Colors.WARNING}No custom roles found.{Colors.ENDC}\n")
        return
    
    col_widths = [8, 20, 30, 20, 12]
    separator = format_table_separator(col_widths)
    
    print(separator)
    headers = ["ID", "Name", "Description", "Permissions", "Active"]
    print(format_table_row(headers, col_widths, is_header=True))
    print(separator)
    
    for role in roles:
        values = [
            str(role.id)[:8],
            truncate_value(role.name, 20),
            truncate_value(role.description, 30),
            truncate_value(role.permissions, 20),
            "Yes" if role.is_active else "No",
        ]
        print(format_table_row(values, col_widths))
    
    print(separator)
    print(f"Total: {Colors.OKGREEN}{len(roles)}{Colors.ENDC} custom roles\n")


async def print_interviews_table(session: AsyncSession):
    """Print interviews table."""
    print(f"\n{Colors.HEADER}{Colors.BOLD}=== INTERVIEWS TABLE ==={Colors.ENDC}\n")
    
    result = await session.execute(select(Interview))
    interviews = result.scalars().all()
    
    if not interviews:
        print(f"{Colors.WARNING}No interviews found.{Colors.ENDC}\n")
        return
    
    col_widths = [8, 15, 12, 15, 12, 12]
    separator = format_table_separator(col_widths)
    
    print(separator)
    headers = ["ID", "Title", "Status", "Candidate", "Interviewer", "Created"]
    print(format_table_row(headers, col_widths, is_header=True))
    print(separator)
    
    for interview in interviews:
        values = [
            str(interview.id)[:8],
            truncate_value(interview.title, 15),
            interview.status,
            str(interview.candidate_id)[:12],
            str(interview.interviewer_id)[:12],
            interview.created_at.strftime('%Y-%m-%d') if interview.created_at else "N/A",
        ]
        print(format_table_row(values, col_widths))
    
    print(separator)
    print(f"Total: {Colors.OKGREEN}{len(interviews)}{Colors.ENDC} interviews\n")


async def print_scores_table(session: AsyncSession):
    """Print scores table."""
    print(f"\n{Colors.HEADER}{Colors.BOLD}=== SCORES TABLE ==={Colors.ENDC}\n")
    
    result = await session.execute(select(Score))
    scores = result.scalars().all()
    
    if not scores:
        print(f"{Colors.WARNING}No scores found.{Colors.ENDC}\n")
        return
    
    col_widths = [8, 12, 12, 8, 15, 12]
    separator = format_table_separator(col_widths)
    
    print(separator)
    headers = ["ID", "Interview", "Evaluator", "Score", "Feedback", "Created"]
    print(format_table_row(headers, col_widths, is_header=True))
    print(separator)
    
    for score in scores:
        values = [
            str(score.id)[:8],
            str(score.interview_id)[:12],
            str(score.evaluator_id)[:12],
            str(score.score),
            truncate_value(score.feedback, 15),
            score.created_at.strftime('%Y-%m-%d') if score.created_at else "N/A",
        ]
        print(format_table_row(values, col_widths))
    
    print(separator)
    print(f"Total: {Colors.OKGREEN}{len(scores)}{Colors.ENDC} scores\n")


async def print_audit_logs_table(session: AsyncSession):
    """Print audit logs table."""
    print(f"\n{Colors.HEADER}{Colors.BOLD}=== AUDIT LOGS TABLE ==={Colors.ENDC}\n")
    
    result = await session.execute(select(AuditLog).order_by(AuditLog.created_at.desc()).limit(20))
    logs = result.scalars().all()
    
    if not logs:
        print(f"{Colors.WARNING}No audit logs found.{Colors.ENDC}\n")
        return
    
    col_widths = [8, 12, 15, 30, 15]
    separator = format_table_separator(col_widths)
    
    print(separator)
    headers = ["ID", "User", "Action", "Details", "Created"]
    print(format_table_row(headers, col_widths, is_header=True))
    print(separator)
    
    for log in logs:
        values = [
            str(log.id)[:8],
            str(log.user_id)[:12],
            truncate_value(log.action, 15),
            truncate_value(log.details, 30),
            log.created_at.strftime('%Y-%m-%d %H:%M') if log.created_at else "N/A",
        ]
        print(format_table_row(values, col_widths))
    
    print(separator)
    print(f"Total: {Colors.OKGREEN}{len(logs)}{Colors.ENDC} audit logs (showing last 20)\n")


async def print_database_summary(session: AsyncSession):
    """Print database summary statistics."""
    print(f"\n{Colors.HEADER}{Colors.BOLD}=== DATABASE SUMMARY ==={Colors.ENDC}\n")
    
    company_count = await session.execute(select(func.count(Company.id)))
    user_count = await session.execute(select(func.count(User.id)))
    role_count = await session.execute(select(func.count(Role.id)))
    interview_count = await session.execute(select(func.count(Interview.id)))
    score_count = await session.execute(select(func.count(Score.id)))
    audit_log_count = await session.execute(select(func.count(AuditLog.id)))
    
    print(f"  Companies:      {Colors.OKBLUE}{company_count.scalar() or 0}{Colors.ENDC}")
    print(f"  Users:          {Colors.OKGREEN}{user_count.scalar() or 0}{Colors.ENDC}")
    print(f"  Custom Roles:   {Colors.OKCYAN}{role_count.scalar() or 0}{Colors.ENDC}")
    print(f"  Interviews:     {Colors.OKBLUE}{interview_count.scalar() or 0}{Colors.ENDC}")
    print(f"  Scores:         {Colors.OKGREEN}{score_count.scalar() or 0}{Colors.ENDC}")
    print(f"  Audit Logs:     {Colors.WARNING}{audit_log_count.scalar() or 0}{Colors.ENDC}")
    print()


async def main():
    """Main entry point."""
    try:
        # Initialize database
        await init_db()
        
        async with async_session_maker() as session:
            # Print summary
            await print_database_summary(session)
            
            # Print all tables
            await print_companies_table(session)
            await print_users_table(session)
            await print_roles_table(session)
            await print_interviews_table(session)
            await print_scores_table(session)
            await print_audit_logs_table(session)
        
    except Exception as e:
        print(f"{Colors.FAIL}Error: {str(e)}{Colors.ENDC}")
        import traceback
        traceback.print_exc()


if __name__ == "__main__":
    asyncio.run(main())
