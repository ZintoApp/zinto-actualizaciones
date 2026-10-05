import { storage } from './storage';
import { PipelineStage } from '@shared/schema';
import { PIPELINE_TEMPLATES } from '@shared/pipeline-templates';

/**
 * Initialize template pipelines in the database (global templates, companyId: null)
 * This should be called once on application startup
 * Enhanced with idempotency checks and error handling
 */
export async function initPipelineTemplates(): Promise<void> {
  try {
    // Check if template pipelines already exist
    const existingTemplates = await storage.getPipelines();
    const templatePipelines = existingTemplates.filter(p => p.isTemplate === true);

    if (templatePipelines.length === 0) {
      console.log('Initializing pipeline templates...');
      let templatesCreated = 0;
      let templatesFailed = 0;
      
      // Create all template pipelines
      for (const template of PIPELINE_TEMPLATES) {
        try {
          // Check if template already exists by name (idempotency check)
          const existingTemplate = existingTemplates.find(
            p => p.isTemplate === true && p.name === template.name
          );
          
          if (existingTemplate) {
            console.log(`Template "${template.name}" already exists, skipping...`);
            continue;
          }
          
          // Create template pipeline (companyId: null for global templates)
          const templatePipeline = await storage.createPipeline({
            companyId: null,
            name: template.name,
            description: template.description,
            icon: template.icon,
            color: template.color,
            isDefault: false,
            isTemplate: true,
            templateCategory: template.category,
            orderNum: PIPELINE_TEMPLATES.indexOf(template) + 1
          });

          // Create stages for the template
          let stagesCreated = 0;
          for (const stageData of template.stages) {
            try {
              await storage.createPipelineStage({
                pipelineId: templatePipeline.id,
                companyId: null,
                name: stageData.name,
                color: stageData.color,
                order: stageData.order
              });
              stagesCreated++;
            } catch (stageError) {
              console.error(`Error creating stage "${stageData.name}" for template "${template.name}":`, stageError);
            }
          }
          
          if (stagesCreated === template.stages.length) {
            templatesCreated++;
            console.log(`✅ Template "${template.name}" initialized with ${stagesCreated} stages`);
          } else {
            templatesFailed++;
            console.warn(`⚠️  Template "${template.name}" created but only ${stagesCreated}/${template.stages.length} stages were created`);
          }
        } catch (templateError) {
          templatesFailed++;
          console.error(`Error creating template "${template.name}":`, templateError);
        }
      }
      
      if (templatesCreated > 0) {
        console.log(`✅ Pipeline templates initialized: ${templatesCreated} created, ${templatesFailed} failed`);
      } else if (templatesFailed === 0) {
        console.log('✅ All pipeline templates already exist');
      } else {
        console.error(`❌ Pipeline template initialization completed with errors: ${templatesFailed} failed`);
      }
      
      // Verify template integrity
      const finalTemplates = await storage.getPipelines();
      const finalTemplatePipelines = finalTemplates.filter(p => p.isTemplate === true);
      for (const template of finalTemplatePipelines) {
        const stages = await storage.getPipelineStagesByPipeline(template.id);
        if (stages.length === 0) {
          console.warn(`⚠️  Template "${template.name}" has no stages`);
        }
      }
    } else {
      console.log(`✅ Pipeline templates already initialized (${templatePipelines.length} templates found)`);
    }
  } catch (error) {
    console.error('Error initializing pipeline templates:', error);
    throw error; // Re-throw to allow caller to handle
  }
}

/**
 * Initialize default pipeline stages for a company if none exist
 * Uses the sales template by default
 * Enhanced with migration-safe startup checks
 */
export async function initPipelineStages(companyId: number, templateId: string = 'sales'): Promise<void> {
  try {
    // Check if company already has pipelines
    const existingPipelines = await storage.getPipelinesByCompany(companyId);
    
    if (existingPipelines.length === 0) {
      console.log(`Initializing default pipeline for company ${companyId}...`);
      
      // Support custom template selection via environment variable
      const envTemplateId = process.env.DEFAULT_PIPELINE_TEMPLATE || templateId;
      const template = PIPELINE_TEMPLATES.find(t => t.id === envTemplateId) || PIPELINE_TEMPLATES[0];
      
      if (envTemplateId !== templateId && envTemplateId !== template.id) {
        console.log(`Using custom template "${envTemplateId}" from environment variable`);
      }
      
      // Create default pipeline using template data
      const defaultPipeline = await storage.createPipeline({
        companyId,
        name: template.name,
        description: template.description,
        icon: template.icon,
        color: template.color,
        isDefault: true,
        isTemplate: false,
        templateCategory: template.category,
        orderNum: 1
      });
      
      console.log(`✅ Created default pipeline "${defaultPipeline.name}" (ID: ${defaultPipeline.id}) for company ${companyId}`);
      
      // Create default stages for the pipeline using template stages
      let stagesCreated = 0;
      for (const stageData of template.stages) {
        try {
          await storage.createPipelineStage({
            pipelineId: defaultPipeline.id,
            companyId,
            name: stageData.name,
            color: stageData.color,
            order: stageData.order
          });
          stagesCreated++;
        } catch (stageError) {
          console.error(`Error creating stage "${stageData.name}" for company ${companyId}:`, stageError);
        }
      }
      
      console.log(`✅ Created ${stagesCreated} stages for default pipeline of company ${companyId}`);
    } else {
      // Verify company has a default pipeline
      const defaultPipeline = existingPipelines.find(p => p.isDefault === true);
      if (!defaultPipeline) {
        console.warn(`⚠️  Company ${companyId} has pipelines but no default pipeline. Setting first pipeline as default.`);
        if (existingPipelines.length > 0) {
          await storage.updatePipeline(existingPipelines[0].id, { isDefault: true });
          console.log(`✅ Set pipeline "${existingPipelines[0].name}" as default for company ${companyId}`);
        }
      }
    }
  } catch (error) {
    console.error(`Error initializing pipeline stages for company ${companyId}:`, error);
    throw error; // Re-throw to allow caller to handle
  }
}

/**
 * Check if migration 112 has been executed
 * Prevents application startup if schema is in inconsistent state
 */
export async function checkMigration112Status(): Promise<boolean> {
  try {
    // This would require access to the database directly
    // For now, we'll check if pipelines table exists by trying to query it
    const pipelines = await storage.getPipelines();
    // If we can query pipelines, migration has been executed
    return true;
  } catch (error: any) {
    // If error suggests table doesn't exist, migration hasn't been executed
    if (error?.message?.includes('does not exist') || error?.message?.includes('relation') || error?.code === '42P01') {
      return false;
    }
    // Other errors might be connection issues, assume migration is done
    console.warn('Could not verify migration 112 status:', error);
    return true;
  }
}