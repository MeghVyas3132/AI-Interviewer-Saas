import psycopg2

conn = psycopg2.connect('postgresql://ai_interviewer_user:ai_interviewer_password@localhost:5432/ai_interviewer_db')
cur = conn.cursor()
cur.execute("UPDATE candidates SET status = 'interview_scheduled' WHERE email = 'sakshi@gmail.com'")
conn.commit()
print('Updated sakshi status to interview_scheduled')
conn.close()
