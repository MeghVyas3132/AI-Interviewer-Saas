from sqlalchemy import create_engine, text
e = create_engine('postgresql://ai_interviewer_user:ai_interviewer_password@localhost:5432/ai_interviewer_db')
c = e.connect()

# Check employees
print('EMPLOYEES:')
r = c.execute(text("SELECT email, role, id FROM users WHERE role = 'EMPLOYEE'"))
for row in r:
    print(f'{row[0]} | {row[1]} | {row[2]}')

# Check candidates with assignments
print()
print('CANDIDATES WITH ASSIGNMENTS:')
r = c.execute(text('SELECT c.email, c.status, c.assigned_to, u.email as assigned_email FROM candidates c LEFT JOIN users u ON c.assigned_to = u.id'))
for row in r:
    print(f'{row[0]} | {row[1]} | assigned to: {row[3]}')
