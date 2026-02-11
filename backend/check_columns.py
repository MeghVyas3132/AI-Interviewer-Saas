from sqlalchemy import create_engine, text
e = create_engine('postgresql://ai_interviewer_user:ai_interviewer_password@localhost:5432/ai_interviewer_db')
c = e.connect()
r = c.execute(text("SELECT column_name FROM information_schema.columns WHERE table_name = 'candidates' ORDER BY ordinal_position"))
for row in r:
    print(row[0])
