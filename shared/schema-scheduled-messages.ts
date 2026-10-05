import { pgTable, text, varchar, serial, integer, boolean, timestamp, jsonb, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";


export const scheduledMessageStatusEnum = pgEnum('scheduled_message_status', [
  'pending',
  'scheduled', 
  'processing',
  'sent',
  'failed',
  'cancelled'
]);


export const scheduledMessages = pgTable("scheduled_messages", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull(),
  conversationId: integer("conversation_id").notNull(),
  channelId: integer("channel_id").notNull(),
  channelType: text("channel_type").notNull(), // 'whatsapp', 'instagram', 'messenger', 'email', etc.
  

  content: text("content").notNull(),
  messageType: text("message_type").notNull().default('text'), // 'text', 'media', 'template', etc.
  mediaUrl: text("media_url"),
  mediaType: text("media_type"), // 'image', 'video', 'audio', 'document'
  caption: text("caption"),
  

  scheduledFor: timestamp("scheduled_for").notNull(),
  timezone: text("timezone").default('UTC'),
  

  status: scheduledMessageStatusEnum("status").default('pending'),
  attempts: integer("attempts").default(0),
  maxAttempts: integer("max_attempts").default(3),
  lastAttemptAt: timestamp("last_attempt_at"),
  sentAt: timestamp("sent_at"),
  failedAt: timestamp("failed_at"),
  errorMessage: text("error_message"),
  

  metadata: jsonb("metadata").default('{}'), // Additional data like quick replies, templates, etc.
  createdBy: integer("created_by").notNull(), // User who scheduled the message
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow()
});


export const insertScheduledMessageSchema = createInsertSchema(scheduledMessages, {
  content: z.string().min(1, "Message content is required"),
  scheduledFor: z.date().refine((date) => date > new Date(), "Scheduled time must be in the future"),
  messageType: z.enum(['text', 'media', 'template', 'quick_replies']).default('text'),
  status: z.enum(['pending', 'scheduled', 'processing', 'sent', 'failed', 'cancelled']).default('pending')
});

export type ScheduledMessage = typeof scheduledMessages.$inferSelect;
export type InsertScheduledMessage = z.infer<typeof insertScheduledMessageSchema>;
