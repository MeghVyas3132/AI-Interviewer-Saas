"""
File parsing utilities for bulk candidate imports
Supports CSV, Excel (XLSX), and data validation
"""

import io
import logging
from typing import List, Dict, Any, Tuple
from pathlib import Path

import pandas as pd

logger = logging.getLogger(__name__)


class FileParseError(Exception):
    """Raised when file parsing fails"""
    pass


class CandidateImportParser:
    """Parse and validate candidate data from various file formats"""
    
    # Required fields for candidate import
    REQUIRED_FIELDS = {"email", "first_name", "last_name"}
    
    # Optional fields that map to candidate model
    OPTIONAL_FIELDS = {
        "phone": "phone",
        "domain": "domain",
        "position": "position",
        "experience_years": "experience_years",
        "qualifications": "qualifications",
        "resume_url": "resume_url",
    }
    
    # All valid field names (case-insensitive)
    VALID_FIELDS = REQUIRED_FIELDS | set(OPTIONAL_FIELDS.keys())
    
    @staticmethod
    def parse_file(
        file_content: bytes,
        filename: str,
    ) -> Tuple[List[Dict[str, Any]], List[str]]:
        """
        Parse candidate data from uploaded file
        
        Args:
            file_content: File bytes
            filename: Original filename
            
        Returns:
            Tuple of (parsed_candidates, errors)
            - parsed_candidates: List of validated candidate dicts
            - errors: List of error messages
        """
        file_ext = Path(filename).suffix.lower()
        
        if file_ext == ".csv":
            return CandidateImportParser._parse_csv(file_content)
        elif file_ext in [".xlsx", ".xls"]:
            return CandidateImportParser._parse_excel(file_content)
        else:
            raise FileParseError(f"Unsupported file format: {file_ext}. Use CSV or XLSX.")
    
    @staticmethod
    def _parse_csv(file_content: bytes) -> Tuple[List[Dict[str, Any]], List[str]]:
        """Parse CSV file"""
        try:
            # Decode and read CSV
            csv_string = file_content.decode("utf-8")
            df = pd.read_csv(io.StringIO(csv_string))
            
            logger.info(f"✅ CSV parsed: {len(df)} rows, {len(df.columns)} columns")
            return CandidateImportParser._process_dataframe(df)
            
        except UnicodeDecodeError:
            raise FileParseError("CSV file encoding error. Please use UTF-8 encoding.")
        except pd.errors.ParserError as e:
            raise FileParseError(f"CSV parsing error: {str(e)}")
    
    @staticmethod
    def _parse_excel(file_content: bytes) -> Tuple[List[Dict[str, Any]], List[str]]:
        """Parse Excel file (XLSX/XLS)"""
        try:
            # Read Excel
            excel_file = io.BytesIO(file_content)
            df = pd.read_excel(excel_file, sheet_name=0)  # First sheet
            
            logger.info(f"✅ Excel parsed: {len(df)} rows, {len(df.columns)} columns")
            return CandidateImportParser._process_dataframe(df)
            
        except Exception as e:
            raise FileParseError(f"Excel parsing error: {str(e)}")
    
    @staticmethod
    def _process_dataframe(
        df: pd.DataFrame,
    ) -> Tuple[List[Dict[str, Any]], List[str]]:
        """
        Process DataFrame and validate rows
        
        Args:
            df: Pandas DataFrame
            
        Returns:
            Tuple of (valid_candidates, errors)
        """
        errors = []
        valid_candidates = []
        
        # Normalize column names (lowercase, strip whitespace)
        df.columns = df.columns.str.lower().str.strip()
        
        # Check required fields exist
        missing_fields = CandidateImportParser.REQUIRED_FIELDS - set(df.columns)
        if missing_fields:
            raise FileParseError(
                f"Missing required columns: {', '.join(missing_fields)}. "
                f"Required: email, first_name, last_name"
            )
        
        # Process each row
        for idx, row in df.iterrows():
            row_num = idx + 2  # +1 for 0-indexing, +1 for header row
            
            try:
                candidate = CandidateImportParser._validate_row(row, row_num)
                valid_candidates.append(candidate)
            except ValueError as e:
                errors.append(f"Row {row_num}: {str(e)}")
        
        logger.info(
            f"✅ Processed {len(valid_candidates)} valid candidates, "
            f"{len(errors)} errors"
        )
        
        return valid_candidates, errors
    
    @staticmethod
    def _validate_row(row: pd.Series, row_num: int) -> Dict[str, Any]:
        """
        Validate and extract candidate data from row
        
        Args:
            row: DataFrame row
            row_num: Row number (for error messages)
            
        Returns:
            Validated candidate dict
            
        Raises:
            ValueError: If validation fails
        """
        candidate = {}
        
        # Validate required fields
        email = str(row.get("email", "")).strip()
        if not email or email.lower() == "nan":
            raise ValueError("Email is required and cannot be empty")
        
        if not CandidateImportParser._validate_email(email):
            raise ValueError(f"Invalid email format: {email}")
        
        candidate["email"] = email.lower()
        
        # First name
        first_name = str(row.get("first_name", "")).strip()
        if not first_name or first_name.lower() == "nan":
            raise ValueError("First name is required")
        candidate["first_name"] = first_name
        
        # Last name
        last_name = str(row.get("last_name", "")).strip()
        if not last_name or last_name.lower() == "nan":
            raise ValueError("Last name is required")
        candidate["last_name"] = last_name
        
        # Optional fields
        phone = str(row.get("phone", "")).strip()
        if phone and phone.lower() != "nan":
            if not CandidateImportParser._validate_phone(phone):
                raise ValueError(f"Invalid phone format: {phone}")
            candidate["phone"] = phone
        
        domain = str(row.get("domain", "")).strip()
        if domain and domain.lower() != "nan":
            candidate["domain"] = domain
        
        position = str(row.get("position", "")).strip()
        if position and position.lower() != "nan":
            candidate["position"] = position
        
        experience_years_raw = row.get("experience_years", None)
        if experience_years_raw and str(experience_years_raw).lower() != "nan":
            try:
                exp_years = int(float(experience_years_raw))
                if exp_years < 0 or exp_years > 100:
                    raise ValueError(f"Experience years must be 0-100, got {exp_years}")
                candidate["experience_years"] = exp_years
            except (ValueError, TypeError):
                raise ValueError(f"Invalid experience_years: {experience_years_raw}")
        
        qualifications = str(row.get("qualifications", "")).strip()
        if qualifications and qualifications.lower() != "nan":
            candidate["qualifications"] = qualifications
        
        resume_url = str(row.get("resume_url", "")).strip()
        if resume_url and resume_url.lower() != "nan":
            candidate["resume_url"] = resume_url
        
        return candidate
    
    @staticmethod
    def _validate_email(email: str) -> bool:
        """Validate email format"""
        if not email or len(email) < 5 or len(email) > 254:
            return False
        
        # Simple regex for email validation
        import re
        pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
        return bool(re.match(pattern, email))
    
    @staticmethod
    def _validate_phone(phone: str) -> bool:
        """Validate phone number format (basic)"""
        # Accept various formats: +1-234-567-8900, (123) 456-7890, 1234567890, etc.
        import re
        # More lenient pattern allowing hyphens, spaces, parentheses, and + sign
        pattern = r'^[\+]?[0-9\s\(\)\-\.]{9,}$'
        cleaned = phone.replace(' ', '').replace('(', '').replace(')', '').replace('-', '').replace('+', '')
        # Must have at least 10 digits
        return bool(re.match(pattern, phone)) and len([c for c in cleaned if c.isdigit()]) >= 10


class BulkImportStats:
    """Statistics for bulk import operation"""
    
    def __init__(self):
        self.total_rows = 0
        self.successful = 0
        self.failed = 0
        self.duplicates = 0
        self.errors: List[str] = []
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary"""
        return {
            "total_rows": self.total_rows,
            "successful": self.successful,
            "failed": self.failed,
            "duplicates": self.duplicates,
            "success_rate": (
                f"{(self.successful / self.total_rows * 100):.1f}%"
                if self.total_rows > 0 else "0%"
            ),
            "errors": self.errors[:100],  # First 100 errors
            "error_count": len(self.errors),
        }
