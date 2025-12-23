import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

// Initialize Firebase Admin SDK
const serviceAccount = {
  type: "service_account",
  project_id: "time-4322a",
  private_key_id: "2943c996a5a3bdfab733a6f4322ae840b21fdab0",
  private_key: "-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC58JFCKk4QwSs1\nQZe3ki6uu5uIdWuiOxOQRPxsaCMU9/BC4FuP5T1fUXrIu5nuiFzUfauOflt/l3gn\n0nuDjYaaUsZaWJyeS891zgtQiqxQZ88Ra5cpex89HrOPIxNTZT3qNEkG10rYAiSk\n0CCSzcvRQzVzmbHKPkoP94Hxe93ubqtn8nPqQ1D1QyEYS0nhzHn5So+twP7wgt7U\nOCLcxvp+HK35beJRajQcs+Yzs99xepNK9hxPccPzRLu82dg5i3SKvR2iCCwtd+Qq\nsZYgKXLukyAyQaTkz9pv6yY0XRXfb1LHkpX+h9pKt1W832PhAmv4tNEMHI/n06ey\n6RaUyOrxAgMBAAECggEAK3OHTnH6ajnp8fkRDknv9M9MqlfePjwV90nXvzGauSSz\nlb0+SGMms2akDdKhRzfAkbuIYrUuhqOL5apvSK/C+79KMQSyHN/UbFApHro5SFTp\n88UzvvLRuwO4rENjGcL39Aoh4qJfEBl4HLeyVPwYnB9bl1ccUAm8XvzU9eyfUT9O\n/TtQa24j/HS7gBvH3VFlCkpf+aACN/HCE96SZBJB0oQfRxPsN/08fVHwQ298BxkN\nRUEOIY41YGSocPajvwJ2MInR16PIchXgU/TZivrC/fQl8G70wiMIClZ0KeSDmxqy\nRWr30dSveDNxpDDWTOjv811lV4Mn+/r6Zg2ZgWvQUQKBgQDxL4ZUSwlYAi/B+ZWA\n8K6NiN2+/sruIDxRcUSxf0J7iVpxGwxljDn51RhQCyt68l/YhAe25tIvT3sQ7J/k\nld/lBBVgHCeG4AGa2F+7+YC9bANodvGAuoydJM6i1ykfP3bBE2I4FxK6KwP3ZIjn\nk1+XnW5w+55gYvp+xmDh5lq97QKBgQDFXFbVaKhBWggwhPi/i8hIjC7Ls8JEO05k\nPSVigtUvIED2ZGdIYoqzjyB3VBTL0qXZArNvAo1PwuUd+UdUPrAA8QzUhBhfzRjn\n7B4Kw1AZkxc/+JxtoPbDLfN3xjuTzvQd1EMibumg4uP/OPRfjn0fEgVsVdIwq4dl\nt9xxec3glQKBgB33qLoqhKOxydtRNplJznZ5jgvgPriturDn4QAo7srIuzsYgEbR\n0JZROu8fJCznlq8hYJACSBVmy8TDke5mDOa4xisl9GdWx/xEbEi/7JYcqKO/O6yi\nATy5SQ+EqnBeg1PkI60SeNo25AxGKpiTgConfoR9TyVsxvEflwQaiiXVAoGBAJeY\nigp6zWMFaOz79qYLFNjE9Nz7QuluNJTCcwjsPhxoxf18uejb6HZsJiACscauEz5R\n2MoYR7tQlPUlGSkYzdCrV5OVs7NCszLSJ3FU/R3n4h/9MwrybRkXHsCNwA2VFeYj\nuT2lvEccgMz2Tp9nr6xCB3Bjq4Q+/U2goO95BC7RAoGAXOUoOUVKDheWCf10jKvW\nXCzbYOeRMF1hJ1Eh7gZmEyHw5B4+yjNMiioUSqhibusXL5kgS2DYxC99spSfCPm7\nmC8aYCSi2cV9GQfF4ZC48iFOzh37Gys+C1SGT+9+NH61R/A+iluFMx01YwreHs2c\nWsg9gdIUPl2ElnOIl6FIDus=\n-----END PRIVATE KEY-----\n",
  client_email: "firebase-adminsdk-fbsvc@time-4322a.iam.gserviceaccount.com",
  client_id: "109118200610656596817",
  auth_uri: "https://accounts.google.com/o/oauth2/auth",
  token_uri: "https://oauth2.googleapis.com/token",
  auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
  client_x509_cert_url: "https://www.googleapis.com/robot/v1/metadata/x509/firebase-adminsdk-fbsvc%40time-4322a.iam.gserviceaccount.com",
  universe_domain: "googleapis.com"
};

// Initialize Firebase Admin if not already initialized
const app = getApps().length === 0 
  ? initializeApp({
      credential: cert(serviceAccount),
      projectId: 'time-4322a'
    })
  : getApps()[0];

// Get Firestore instance
export const db = getFirestore(app);

// Database collections
export const COLLECTIONS = {
  EXAMS: 'exams',
  SUBCATEGORIES: 'subcategories',
  QUESTIONS: 'questions',
  CAT_QUESTIONS: 'cat_questions'
} as const;

// Types for database documents
export interface Exam {
  id: string;
  name: string;
  description: string;
  createdAt: Date;
  updatedAt: Date;
  isActive: boolean;
}

export interface Subcategory {
  id: string;
  examId: string;
  name: string;
  description: string;
  createdAt: Date;
  updatedAt: Date;
  isActive: boolean;
}

export interface Question {
  id: string;
  examId: string;
  subcategoryId: string;
  category: string;
  subcategory: string;
  subsection: string;
  question: string;
  createdAt: Date;
  updatedAt: Date;
  isActive: boolean;
}

export interface CATQuestion {
  id: string;
  category: string;
  subcategory: string;
  subsection: string;
  question: string;
  createdAt: Date;
  updatedAt: Date;
  isActive: boolean;
}
