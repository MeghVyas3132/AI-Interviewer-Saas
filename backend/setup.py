"""
Setup script for backend package
"""

from setuptools import setup, find_packages

setup(
    name="ai-interviewer-backend",
    version="1.0.0",
    description="AI Interviewer Platform Backend",
    author="Your Team",
    packages=find_packages(),
    python_requires=">=3.11",
    install_requires=[
        line.strip()
        for line in open("requirements.txt")
        if line.strip() and not line.startswith("#")
    ],
)
