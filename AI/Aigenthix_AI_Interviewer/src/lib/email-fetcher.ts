import Imap from 'imap';
import { simpleParser, ParsedMail } from 'mailparser';

interface EmailConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  tls: boolean;
  tlsOptions?: {
    rejectUnauthorized: boolean;
  };
}

interface FetchedEmail {
  uid: number;
  messageId: string;
  subject: string;
  from: string;
  date: Date;
  text: string;
  html: string;
  attachments?: Array<{
    filename: string;
    content: Buffer;
    contentType: string;
  }>;
}

export class EmailFetcher {
  private imap: Imap;
  private config: EmailConfig;

  constructor(config: EmailConfig) {
    this.config = config;
    this.imap = new Imap({
      user: config.user,
      password: config.password,
      host: config.host,
      port: config.port,
      tls: config.tls,
      tlsOptions: config.tlsOptions || { rejectUnauthorized: false },
    });
  }

  /**
   * Connect to IMAP server
   */
  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.imap.once('ready', () => {
        console.log('Connected to IMAP server');
        resolve();
      });

      this.imap.once('error', (err: Error) => {
        console.error('IMAP connection error:', err);
        reject(err);
      });

      this.imap.connect();
    });
  }

  /**
   * Disconnect from IMAP server
   */
  async disconnect(): Promise<void> {
    return new Promise((resolve) => {
      if (this.imap.state === 'authenticated' || this.imap.state === 'connected') {
        this.imap.end();
      }
      this.imap.once('end', () => {
        console.log('Disconnected from IMAP server');
        resolve();
      });
      resolve();
    });
  }

  /**
   * Open a mailbox
   */
  async openBox(boxName: string = 'INBOX'): Promise<void> {
    return new Promise((resolve, reject) => {
      this.imap.openBox(boxName, true, (err, box) => {
        if (err) {
          reject(err);
          return;
        }
        console.log(`Opened mailbox: ${boxName} (${box.messages.total} messages)`);
        resolve();
      });
    });
  }

  /**
   * Search for emails matching criteria
   */
  async searchEmails(criteria: string[] = ['UNSEEN']): Promise<number[]> {
    return new Promise((resolve, reject) => {
      this.imap.search(criteria, (err, results) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(results || []);
      });
    });
  }

  /**
   * Fetch email by UID
   */
  async fetchEmail(uid: number): Promise<FetchedEmail | null> {
    return new Promise((resolve, reject) => {
      const fetch = this.imap.fetch([uid], {
        bodies: '',
        struct: true,
      });

      let emailData: any = {};

      fetch.on('message', (msg, seqno) => {
        let emailBody = '';

        msg.on('body', (stream, info) => {
          let buffer = Buffer.alloc(0);

          stream.on('data', (chunk) => {
            buffer = Buffer.concat([buffer, chunk]);
          });

          stream.on('end', () => {
            emailBody = buffer.toString();
          });
        });

        msg.once('attributes', (attrs) => {
          emailData.uid = attrs.uid;
          emailData.flags = attrs.flags;
          emailData.date = attrs.date;
        });

        msg.once('end', () => {
          // Parse the email
          simpleParser(emailBody)
            .then((parsed: ParsedMail) => {
              const fetchedEmail: FetchedEmail = {
                uid: emailData.uid,
                messageId: parsed.messageId || `email-${emailData.uid}`,
                subject: parsed.subject || '',
                from: parsed.from?.text || parsed.from?.value?.[0]?.address || '',
                date: parsed.date || emailData.date || new Date(),
                text: parsed.text || '',
                html: parsed.html || '',
                attachments: parsed.attachments?.map((att) => ({
                  filename: att.filename || 'attachment',
                  content: att.content as Buffer,
                  contentType: att.contentType || 'application/octet-stream',
                })),
              };

              resolve(fetchedEmail);
            })
            .catch((parseErr) => {
              console.error('Error parsing email:', parseErr);
              reject(parseErr);
            });
        });
      });

      fetch.once('error', (err) => {
        reject(err);
      });

      fetch.once('end', () => {
        // If no message was processed, resolve with null
        if (!emailData.uid) {
          resolve(null);
        }
      });
    });
  }

  /**
   * Fetch multiple emails
   */
  async fetchEmails(uids: number[]): Promise<FetchedEmail[]> {
    const emails: FetchedEmail[] = [];
    
    for (const uid of uids) {
      try {
        const email = await this.fetchEmail(uid);
        if (email) {
          emails.push(email);
        }
      } catch (error) {
        console.error(`Error fetching email ${uid}:`, error);
      }
    }

    return emails;
  }

  /**
   * Mark email as read
   */
  async markAsRead(uid: number): Promise<void> {
    return new Promise((resolve, reject) => {
      this.imap.addFlags(uid, '\\Seen', (err) => {
        if (err) {
          reject(err);
          return;
        }
        resolve();
      });
    });
  }

  /**
   * Fetch all unread emails from inbox
   */
  async fetchUnreadEmails(maxCount: number = 50): Promise<FetchedEmail[]> {
    try {
      await this.openBox();
      const uids = await this.searchEmails(['UNSEEN']);
      
      if (uids.length === 0) {
        console.log('No unread emails found');
        return [];
      }

      // Limit the number of emails to fetch
      const uidsToFetch = uids.slice(0, Math.min(maxCount, uids.length));
      console.log(`Fetching ${uidsToFetch.length} unread emails...`);

      const emails = await this.fetchEmails(uidsToFetch);
      
      // Mark as read after fetching
      for (const email of emails) {
        try {
          await this.markAsRead(email.uid);
        } catch (error) {
          console.error(`Error marking email ${email.uid} as read:`, error);
        }
      }

      return emails;
    } catch (error) {
      console.error('Error fetching unread emails:', error);
      throw error;
    }
  }
}

/**
 * Create EmailFetcher instance from environment variables
 */
export function createEmailFetcher(): EmailFetcher | null {
  const host = process.env.IMAP_HOST;
  const port = parseInt(process.env.IMAP_PORT || '993');
  const user = process.env.IMAP_USER;
  const password = process.env.IMAP_PASSWORD;
  const tls = process.env.IMAP_TLS !== 'false';

  if (!host || !user || !password) {
    console.warn('⚠️  IMAP credentials not configured. Email fetching will be disabled.');
    return null;
  }

  return new EmailFetcher({
    host,
    port,
    user,
    password,
    tls,
    tlsOptions: {
      rejectUnauthorized: process.env.IMAP_REJECT_UNAUTHORIZED !== 'false',
    },
  });
}

