"""
Script to display roles table with users assigned to each role.
Usage: python display_roles.py
"""

import asyncio
import os
import sys
from datetime import datetime
from typing import List
from uuid import UUID

# Add backend directory to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import func

from app.core.database import async_session_maker, init_db
from app.models.role import Role
from app.models.user import User


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


async def get_roles_with_users(session: AsyncSession, company_id: UUID = None) -> dict:
    """
    Fetch all system roles (HR, EMPLOYEE, CANDIDATE) with their assigned users.
    
    Args:
        session: Database session
        company_id: Optional company ID to filter by
        
    Returns:
        Dictionary containing system roles and users data
    """
    from app.models.user import UserRole
    
    roles_data = {}
    
    # Get users grouped by system role
    for system_role in UserRole:
        query = select(User).where(User.role == system_role)
        
        if company_id:
            query = query.where(User.company_id == company_id)
        
        query = query.order_by(User.created_at)
        
        result = await session.execute(query)
        users = result.scalars().all()
        
        roles_data[system_role.value] = {
            "role_name": system_role.value,
            "users": users,
            "user_count": len(users)
        }
    
    return roles_data


def format_table_separator(col_widths: List[int]) -> str:
    """Create a table separator line."""
    return "+" + "+".join("-" * (width + 2) for width in col_widths) + "+"


def format_table_row(values: List[str], col_widths: List[int], is_header: bool = False) -> str:
    """Format a single table row."""
    formatted_values = []
    for value, width in zip(values, col_widths):
        formatted_values.append(value.ljust(width))
    
    row = "| " + " | ".join(formatted_values) + " |"
    
    if is_header:
        row = Colors.BOLD + row + Colors.ENDC
    
    return row


async def display_roles_table(company_id: UUID = None):
    """
    Display system roles table with users in a formatted manner.
    
    Args:
        company_id: Optional company ID to filter by
    """
    print(f"\n{Colors.HEADER}{Colors.BOLD}=== SYSTEM ROLES AND USERS TABLE ==={Colors.ENDC}\n")
    
    async with async_session_maker() as session:
        roles_data = await get_roles_with_users(session, company_id)
        
        if not roles_data:
            print(f"{Colors.WARNING}No users found in the database.{Colors.ENDC}\n")
            return
        
        # Filter out roles with no users
        roles_with_users = {k: v for k, v in roles_data.items() if v["user_count"] > 0}
        
        if not roles_with_users:
            print(f"{Colors.WARNING}No users assigned to any roles.{Colors.ENDC}\n")
            return
        
        # Calculate column widths
        col_widths = [
            max(15, max(len(role_name) for role_name in roles_with_users.keys())),  # Role Name
            max(12, max(len(str(data["user_count"])) for data in roles_with_users.values())),  # User Count
        ]
        
        # Print header
        separator = format_table_separator(col_widths)
        print(separator)
        
        header_values = ["System Role", "User Count"]
        print(format_table_row(header_values, col_widths, is_header=True))
        
        print(separator)
        
        # Print roles
        for role_name, data in roles_with_users.items():
            user_count = data["user_count"]
            
            row_values = [
                role_name,
                str(user_count),
            ]
            
            # Color code by user count
            if user_count > 5:
                row = format_table_row(row_values, col_widths)
                row = Colors.OKGREEN + row + Colors.ENDC
            else:
                row = format_table_row(row_values, col_widths)
            
            print(row)
        
        print(separator)
        print()
        
        # Print detailed users per role
        print(f"{Colors.HEADER}{Colors.BOLD}=== DETAILED USERS BY ROLE ==={Colors.ENDC}\n")
        
        for idx, (role_name, data) in enumerate(roles_with_users.items(), 1):
            users = data["users"]
            
            print(f"{Colors.OKBLUE}{Colors.BOLD}Role #{idx}: {role_name}{Colors.ENDC}")
            print(f"  Total Users: {Colors.OKGREEN}{len(users)}{Colors.ENDC}\n")
            
            if users:
                print(f"  {Colors.BOLD}Users assigned:{Colors.ENDC}")
                
                # User table
                user_col_widths = [
                    max(10, max(len(str(user.id)[:8]) for user in users)),
                    max(20, max(len(user.name) for user in users)),
                    max(25, max(len(user.email) for user in users)),
                    max(15, max(len(user.department or "N/A") for user in users)),
                ]
                
                user_separator = format_table_separator(user_col_widths)
                print(f"  {user_separator}")
                
                user_header = ["User ID", "Name", "Email", "Department"]
                user_header_row = format_table_row(user_header, user_col_widths, is_header=True)
                print(f"  {user_header_row}")
                
                print(f"  {user_separator}")
                
                for user in users:
                    user_id_str = str(user.id)[:8]
                    dept = user.department or "N/A"
                    
                    user_values = [user_id_str, user.name, user.email, dept]
                    user_row = format_table_row(user_values, user_col_widths)
                    print(f"  {user_row}")
                
                print(f"  {user_separator}")
            
            print()
        
        # Summary statistics
        print(f"{Colors.HEADER}{Colors.BOLD}=== SUMMARY STATISTICS ==={Colors.ENDC}\n")
        
        total_roles = len(roles_with_users)
        total_users_assigned = sum(data["user_count"] for data in roles_with_users.values())
        
        print(f"  Total Roles with Users: {Colors.OKBLUE}{total_roles}{Colors.ENDC}")
        print(f"  Total Users: {Colors.OKGREEN}{total_users_assigned}{Colors.ENDC}")
        
        if total_roles > 0:
            avg_users = total_users_assigned / total_roles
            print(f"  Average Users per Role: {Colors.OKCYAN}{avg_users:.1f}{Colors.ENDC}")
        
        print()


async def main():
    """Main entry point."""
    try:
        # Initialize database
        await init_db()
        
        # Display roles table
        await display_roles_table()
        
    except Exception as e:
        print(f"{Colors.FAIL}Error: {str(e)}{Colors.ENDC}")
        import traceback
        traceback.print_exc()


if __name__ == "__main__":
    asyncio.run(main())
