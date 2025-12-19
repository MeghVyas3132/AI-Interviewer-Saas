#!/usr/bin/env tsx

import dotenv from 'dotenv';
import nodemailer from 'nodemailer';
dotenv.config({ path: '.env' });

console.log('Testing Email Service Directly with SendGrid SMTP...');
console.log(`MAIL_HOST: ${process.env.MAIL_HOST || 'NOT SET'}`);
console.log(`MAIL_PORT: ${process.env.MAIL_PORT || 'NOT SET'}`);
console.log(`MAIL_USERNAME: ${process.env.MAIL_USERNAME || 'NOT SET'}`);
console.log(`MAIL_PASSWORD: ${process.env.MAIL_PASSWORD ? 'SET (' + process.env.MAIL_PASSWORD.substring(0, 10) + '...)' : 'NOT SET'}`);
console.log(`MAIL_FROM_ADDRESS: ${process.env.MAIL_FROM_ADDRESS || 'NOT SET'}`);
console.log(`MAIL_FROM_NAME: ${process.env.MAIL_FROM_NAME || 'NOT SET'}`);

if (!process.env.MAIL_PASSWORD) {
  console.error('❌ MAIL_PASSWORD is not set in environment');
  process.exit(1);
}

const mailHost = process.env.MAIL_HOST || 'smtp.sendgrid.net';
const mailPort = parseInt(process.env.MAIL_PORT || '587', 10);
const mailUsername = process.env.MAIL_USERNAME || 'apikey';
const mailPassword = process.env.MAIL_PASSWORD;
const mailEncryption = process.env.MAIL_ENCRYPTION || 'tls';

const transporter = nodemailer.createTransport({
  host: mailHost,
  port: mailPort,
  secure: mailEncryption === 'ssl' || mailPort === 465,
  auth: {
    user: mailUsername,
    pass: mailPassword,
  },
  tls: {
    rejectUnauthorized: false,
  },
});

const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:9002';
const token = Array.from(crypto.getRandomValues(new Uint8Array(16)), 
  byte => byte.toString(16).padStart(2, '0')).join('');
const interviewLink = `${baseUrl}/interview/${token}`;

async function testEmail() {
  try {
    const mailFromAddress = process.env.MAIL_FROM_ADDRESS || 'communicationt4@gmail.com';
    const mailFromName = process.env.MAIL_FROM_NAME || 'Communicationt4e';
    const fromAddress = `${mailFromName} <${mailFromAddress}>`;

    console.log('\n📧 Sending test email...');
    console.log(`To: test@example.com`);
    console.log(`From: ${fromAddress}`);
    console.log(`Link: ${interviewLink}`);
    
    const result = await transporter.sendMail({
      from: fromAddress,
      to: 'test@example.com',
      subject: 'Test Interview Invitation - AigenthixAI Interview',
      html: `
        <h2>Hello Test Candidate!</h2>
        <p>This is a test email from AigenthixAI Interviewer.</p>
        <p><a href="${interviewLink}">Start Interview</a></p>
        <p>This is just a test - you can ignore this email.</p>
      `,
      text: `Hello Test Candidate! This is a test email. Interview link: ${interviewLink}`
    });

    console.log('\n✅ Email sent successfully!');
    console.log(`Message ID: ${result.messageId}`);
    console.log(`Response: ${result.response}`);
    console.log('\n⚠️  Note: Email was sent to test@example.com (change this for real testing)');
    
  } catch (error: any) {
    console.error('\n❌ Email sending failed:');
    console.error(`Error: ${error.message}`);
    if (error.response) {
      console.error('Response:', JSON.stringify(error.response, null, 2));
    }
    process.exit(1);
  }
}

testEmail();
