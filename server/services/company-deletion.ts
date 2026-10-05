import { storage } from '../storage';
import { db } from '../db';
import {
  companies, users, contacts, conversations, messages, notes,
  channelConnections, flows, deals,
  pipelineStages, companySettings, paymentTransactions, teamInvitations,
  googleCalendarTokens, companyPages, followUpTemplates, followUpSchedules,
  agentCalendarSettings
} from '../../shared/schema';
import { eq, inArray, sql } from 'drizzle-orm';
import * as fs from 'fs';
import * as path from 'path';

export interface CompanyDeletionSummary {
  companyId: number;
  companyName: string;
  deletedCounts: {
    users: number;
    contacts: number;
    conversations: number;
    messages: number;
    notes: number;
    channelConnections: number;
    flows: number;
    deals: number;
    pipelineStages: number;
    companySettings: number;
    paymentTransactions: number;
    teamInvitations: number;
    googleCalendarTokens: number;
    companyPages: number;
    agentCalendarSettings: number;
    followUpTemplates: number;
    followUpSchedules: number;
    mediaFiles: number;
    whatsappSessions: number;
  };
  deletedAt: Date;
  deletedBy: number;
}

export interface CompanyDeletionPreview {
  companyId: number;
  companyName: string;
  dataToDelete: {
    users: number;
    contacts: number;
    conversations: number;
    messages: number;
    notes: number;
    channelConnections: number;
    flows: number;
    deals: number;
    pipelineStages: number;
    companySettings: number;
    paymentTransactions: number;
    teamInvitations: number;
    googleCalendarTokens: number;
    companyPages: number;
    agentCalendarSettings: number;
    estimatedMediaFiles: number;
    estimatedWhatsappSessions: number;
  };
  warnings: string[];
}

export class CompanyDeletionService {

  /**
   * Get a preview of what will be deleted for a company
   */
  async getCompanyDeletionPreview(companyId: number): Promise<CompanyDeletionPreview | null> {
    try {
      const company = await storage.getCompany(companyId);
      if (!company) {
        return null;
      }

      const [
        usersCount,
        contactsCount,
        conversationsCount,
        messagesCount,
        notesCount,
        channelConnectionsCount,
        flowsCount,
        dealsCount,
        pipelineStagesCount,
        companySettingsCount,
        paymentTransactionsCount,
        teamInvitationsCount,
        googleCalendarTokensCount,
        companyPagesCount,
        agentCalendarSettingsCount
      ] = await Promise.all([
        this.countRecords(users, companyId),
        this.countRecords(contacts, companyId),
        this.countRecords(conversations, companyId),
        this.countRecords(messages, companyId, 'conversationId', conversations),
        this.countRecords(notes, companyId, 'contactId', contacts),
        this.countRecords(channelConnections, companyId),
        this.countRecords(flows, companyId),
        this.countRecords(deals, companyId),
        this.countRecords(pipelineStages, companyId),
        this.countRecords(companySettings, companyId),
        this.countRecords(paymentTransactions, companyId),
        this.countRecords(teamInvitations, companyId),
        this.countRecords(googleCalendarTokens, companyId),
        this.countRecords(companyPages, companyId),
        this.countRecords(agentCalendarSettings, companyId)
      ]);

      const estimatedMediaFiles = await this.estimateMediaFiles(companyId);
      const estimatedWhatsappSessions = await this.estimateWhatsappSessions(companyId);

      const warnings: string[] = [];
      if (usersCount > 0) {
        warnings.push(`${usersCount} user account(s) will be permanently deleted`);
      }
      if (conversationsCount > 0) {
        warnings.push(`${conversationsCount} conversation(s) with ${messagesCount} message(s) will be permanently deleted`);
      }
      if (contactsCount > 0) {
        warnings.push(`${contactsCount} contact(s) and their data will be permanently deleted`);
      }
      if (companyPagesCount > 0) {
        warnings.push(`${companyPagesCount} company page(s) will be permanently deleted`);
      }
      if (estimatedMediaFiles > 0) {
        warnings.push(`Approximately ${estimatedMediaFiles} media file(s) will be permanently deleted from storage`);
      }
      if (estimatedWhatsappSessions > 0) {
        warnings.push(`${estimatedWhatsappSessions} WhatsApp session(s) will be permanently deleted`);
      }
      if (paymentTransactionsCount > 0) {
        warnings.push(`${paymentTransactionsCount} payment transaction record(s) will be permanently deleted`);
      }

      return {
        companyId,
        companyName: company.name,
        dataToDelete: {
          users: usersCount,
          contacts: contactsCount,
          conversations: conversationsCount,
          messages: messagesCount,
          notes: notesCount,
          channelConnections: channelConnectionsCount,
          flows: flowsCount,
          deals: dealsCount,
          pipelineStages: pipelineStagesCount,
          companySettings: companySettingsCount,
          paymentTransactions: paymentTransactionsCount,
          teamInvitations: teamInvitationsCount,
          googleCalendarTokens: googleCalendarTokensCount,
          companyPages: companyPagesCount,
          agentCalendarSettings: agentCalendarSettingsCount,
          estimatedMediaFiles,
          estimatedWhatsappSessions
        },
        warnings
      };

    } catch (error) {
      console.error('Error getting company deletion preview:', error);
      throw error;
    }
  }

  /**
   * Delete a company and all its related data
   */
  async deleteCompany(companyId: number, deletedBy: number): Promise<CompanyDeletionSummary> {
    try {
      const company = await storage.getCompany(companyId);
      if (!company) {
        throw new Error(`Company with ID ${companyId} not found`);
      }

      if (company.slug === 'system') {
        throw new Error('Cannot delete the system company');
      }

      

      const deletionSummary = await db.transaction(async (tx) => {
        const summary: CompanyDeletionSummary = {
          companyId,
          companyName: company.name,
          deletedCounts: {
            users: 0,
            contacts: 0,
            conversations: 0,
            messages: 0,
            notes: 0,
            channelConnections: 0,
            flows: 0,
            deals: 0,
            pipelineStages: 0,
            companySettings: 0,
            paymentTransactions: 0,
            teamInvitations: 0,
            googleCalendarTokens: 0,
            companyPages: 0,
            agentCalendarSettings: 0,
            followUpTemplates: 0,
            followUpSchedules: 0,
            mediaFiles: 0,
            whatsappSessions: 0
          },
          deletedAt: new Date(),
          deletedBy
        };


        
        const conversationIds = await this.getRelatedIds(tx, conversations, companyId);
        if (conversationIds.length > 0) {
          const messageResult = await tx.delete(messages)
            .where(inArray(messages.conversationId, conversationIds));
          summary.deletedCounts.messages = messageResult.rowCount || 0;
        }

        
        const contactIds = await this.getRelatedIds(tx, contacts, companyId);
        if (contactIds.length > 0) {
          const noteResult = await tx.delete(notes)
            .where(inArray(notes.contactId, contactIds));
          summary.deletedCounts.notes = noteResult.rowCount || 0;
        }

        
        const tokenResult = await tx.delete(googleCalendarTokens)
          .where(eq(googleCalendarTokens.companyId, companyId));
        summary.deletedCounts.googleCalendarTokens = tokenResult.rowCount || 0;

        const agentCalendarSettingsResult = await tx.delete(agentCalendarSettings)
          .where(eq(agentCalendarSettings.companyId, companyId));
        summary.deletedCounts.agentCalendarSettings = agentCalendarSettingsResult.rowCount || 0;

        // Delete follow-up templates and schedules before users to avoid FK constraint violations
        const followUpTemplatesResult = await tx.delete(followUpTemplates)
          .where(eq(followUpTemplates.companyId, companyId));
        summary.deletedCounts.followUpTemplates = followUpTemplatesResult.rowCount || 0;

        const followUpSchedulesResult = await tx.delete(followUpSchedules)
          .where(eq(followUpSchedules.companyId, companyId));
        summary.deletedCounts.followUpSchedules = followUpSchedulesResult.rowCount || 0;

        const tablesToDelete = [
          { table: teamInvitations, field: 'teamInvitations' },
          { table: paymentTransactions, field: 'paymentTransactions' },
          { table: companySettings, field: 'companySettings' },
          { table: deals, field: 'deals' },
          { table: pipelineStages, field: 'pipelineStages' },
          { table: flows, field: 'flows' },
          { table: channelConnections, field: 'channelConnections' },
          { table: conversations, field: 'conversations' },
          { table: contacts, field: 'contacts' },
          { table: companyPages, field: 'companyPages' }, // Delete company pages before users to avoid FK constraint
        ];

        for (const { table, field } of tablesToDelete) {
          
          const result = await tx.delete(table)
            .where(eq((table as any).companyId, companyId));
          (summary.deletedCounts as any)[field] = result.rowCount || 0;
        }

        // Delete users - follow-up templates/schedules already deleted to avoid FK constraint
        // If there are still FK constraint violations, delete any remaining references first
        try {
          const usersResult = await tx.delete(users)
            .where(eq(users.companyId, companyId));
          summary.deletedCounts.users = usersResult.rowCount || 0;
        } catch (error: any) {
          // If FK constraint violation, find and delete any remaining references
          if (error.message && error.message.includes('foreign key constraint')) {
            console.warn(`FK constraint violation when deleting users, cleaning up references: ${error.message}`);
            
            // Get user IDs for this company
            const userIds = await tx.select({ id: users.id })
              .from(users)
              .where(eq(users.companyId, companyId));
            
            if (userIds.length > 0) {
              const userIdList = userIds.map(u => u.id);
              
              // Delete any remaining follow_up_templates that reference these users
              // Use raw SQL to handle nullable createdBy field efficiently
              if (userIdList.length > 0) {
                await tx.execute(
                  sql`DELETE FROM follow_up_templates WHERE created_by = ANY(${userIdList})`
                );
              }
              
              // Now try deleting users again
              const usersResult = await tx.delete(users)
                .where(eq(users.companyId, companyId));
              summary.deletedCounts.users = usersResult.rowCount || 0;
            } else {
              summary.deletedCounts.users = 0;
            }
          } else {
            throw error;
          }
        }

        
        await tx.delete(companies)
          .where(eq(companies.id, companyId));

        return summary;
      });

      
      deletionSummary.deletedCounts.mediaFiles = await this.deleteMediaFiles(companyId);
      deletionSummary.deletedCounts.whatsappSessions = await this.deleteWhatsappSessions(companyId);

      await this.logCompanyDeletion(deletionSummary);

      
      return deletionSummary;

    } catch (error) {
      console.error('Error deleting company:', error);
      throw error;
    }
  }

  /**
   * Helper method to count records in a table for a company
   */
  private async countRecords(table: any, companyId: number, foreignKey?: string, foreignTable?: any): Promise<number> {
    try {
      if (foreignKey && foreignTable) {
        const relatedIds = await this.getRelatedIds(db, foreignTable, companyId);
        if (relatedIds.length === 0) return 0;

        let count = 0;
        for (const id of relatedIds) {
          const result = await db.select().from(table).where(eq((table as any)[foreignKey], id));
          count += result.length;
        }
        return count;
      } else {
        const result = await db.select().from(table).where(eq((table as any).companyId, companyId));
        return result.length;
      }
    } catch (error) {
      console.error(`Error counting records for company ${companyId}:`, error);
      return 0;
    }
  }

  /**
   * Helper method to get related IDs from a table
   */
  private async getRelatedIds(dbInstance: any, table: any, companyId: number): Promise<number[]> {
    try {
      const records = await dbInstance.select({ id: (table as any).id })
        .from(table)
        .where(eq((table as any).companyId, companyId));
      return records.map((r: any) => r.id);
    } catch (error) {
      console.error(`Error getting related IDs for company ${companyId}:`, error);
      return [];
    }
  }

  /**
   * Estimate number of media files for a company
   */
  private async estimateMediaFiles(companyId: number): Promise<number> {
    try {
      const uploadsDir = path.join(process.cwd(), 'uploads', companyId.toString());
      if (!fs.existsSync(uploadsDir)) {
        return 0;
      }

      const files = fs.readdirSync(uploadsDir, { recursive: true });
      return files.length;
    } catch (error) {
      console.error(`Error estimating media files for company ${companyId}:`, error);
      return 0;
    }
  }

  /**
   * Estimate number of WhatsApp sessions for a company
   */
  private async estimateWhatsappSessions(companyId: number): Promise<number> {
    try {
      const sessionsDir = path.join(process.cwd(), 'whatsapp-sessions');
      if (!fs.existsSync(sessionsDir)) {
        return 0;
      }

      const sessions = fs.readdirSync(sessionsDir)
        .filter(dir => dir.startsWith(`company-${companyId}-`));
      return sessions.length;
    } catch (error) {
      console.error(`Error estimating WhatsApp sessions for company ${companyId}:`, error);
      return 0;
    }
  }

  /**
   * Delete media files for a company
   */
  private async deleteMediaFiles(companyId: number): Promise<number> {
    try {
      const uploadsDir = path.join(process.cwd(), 'uploads', companyId.toString());
      if (!fs.existsSync(uploadsDir)) {
        return 0;
      }

      const files = fs.readdirSync(uploadsDir, { recursive: true });
      const fileCount = files.length;

      fs.rmSync(uploadsDir, { recursive: true, force: true });

      
      return fileCount;
    } catch (error) {
      console.error(`Error deleting media files for company ${companyId}:`, error);
      return 0;
    }
  }

  /**
   * Delete WhatsApp session files for a company
   */
  private async deleteWhatsappSessions(companyId: number): Promise<number> {
    try {
      const sessionsDir = path.join(process.cwd(), 'whatsapp-sessions');
      if (!fs.existsSync(sessionsDir)) {
        return 0;
      }

      const sessions = fs.readdirSync(sessionsDir)
        .filter(dir => dir.startsWith(`company-${companyId}-`));

      let deletedCount = 0;
      for (const session of sessions) {
        const sessionPath = path.join(sessionsDir, session);
        if (fs.existsSync(sessionPath)) {
          fs.rmSync(sessionPath, { recursive: true, force: true });
          deletedCount++;
        }
      }

      
      return deletedCount;
    } catch (error) {
      console.error(`Error deleting WhatsApp sessions for company ${companyId}:`, error);
      return 0;
    }
  }

  /**
   * Log company deletion for audit trail
   */
  private async logCompanyDeletion(summary: CompanyDeletionSummary): Promise<void> {
    try {
      const auditLog = {
        action: 'company_deletion',
        timestamp: summary.deletedAt.toISOString(),
        deletedBy: summary.deletedBy,
        companyId: summary.companyId,
        companyName: summary.companyName,
        deletedCounts: summary.deletedCounts
      };

      await storage.saveAppSetting(`audit_company_deletion_${summary.companyId}_${Date.now()}`, auditLog);
      
    } catch (error) {
      console.error('Error saving audit log for company deletion:', error);
    }
  }
}

export const companyDeletionService = new CompanyDeletionService();
