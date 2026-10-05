export interface PipelineTemplate {
  id: string;
  name: string;
  category: 'sales' | 'support' | 'real_estate' | 'healthcare' | 'restaurant' | 'legal' | 'education' | 'barbershop' | 'salon' | 'spa';
  description: string;
  icon: string;
  color: string;
  stages: Array<{
    name: string;
    color: string;
    order: number;
  }>;
}

export const PIPELINE_TEMPLATES: PipelineTemplate[] = [
  {
    id: 'sales',
    name: 'Sales Pipeline',
    description: 'Track leads from initial contact through to closing deals',
    icon: 'trending-up',
    color: '#3a86ff',
    category: 'sales',
    stages: [
      { name: 'New Lead', color: '#3a86ff', order: 1 },
      { name: 'Contacted', color: '#4cc9f0', order: 2 },
      { name: 'Meeting Scheduled', color: '#f8961e', order: 3 },
      { name: 'Proposal Sent', color: '#f72585', order: 4 },
      { name: 'Negotiation', color: '#7209b7', order: 5 },
      { name: 'Won', color: '#90be6d', order: 6 },
      { name: 'Lost', color: '#577590', order: 7 }
    ]
  },
  {
    id: 'support',
    name: 'Customer Support',
    description: 'Manage customer support tickets from creation to resolution',
    icon: 'headphones',
    color: '#10b981',
    category: 'support',
    stages: [
      { name: 'New Ticket', color: '#3a86ff', order: 1 },
      { name: 'In Progress', color: '#f8961e', order: 2 },
      { name: 'Waiting for Customer', color: '#f72585', order: 3 },
      { name: 'Escalated', color: '#dc2626', order: 4 },
      { name: 'Resolved', color: '#10b981', order: 5 },
      { name: 'Closed', color: '#6b7280', order: 6 }
    ]
  },
  {
    id: 'real_estate',
    name: 'Real Estate',
    description: 'Track property sales from lead to closing',
    icon: 'home',
    color: '#ef4444',
    category: 'real_estate',
    stages: [
      { name: 'Lead Inquiry', color: '#3a86ff', order: 1 },
      { name: 'Property Viewing', color: '#4cc9f0', order: 2 },
      { name: 'Interest Expressed', color: '#f8961e', order: 3 },
      { name: 'Offer Made', color: '#f72585', order: 4 },
      { name: 'Under Contract', color: '#7209b7', order: 5 },
      { name: 'Inspection', color: '#8b5cf6', order: 6 },
      { name: 'Closing', color: '#10b981', order: 7 },
      { name: 'Sold', color: '#059669', order: 8 },
      { name: 'Withdrawn', color: '#dc2626', order: 9 }
    ]
  },
  {
    id: 'healthcare',
    name: 'Healthcare',
    description: 'Manage patient appointments and care workflows',
    icon: 'heart-pulse',
    color: '#ec4899',
    category: 'healthcare',
    stages: [
      { name: 'Appointment Scheduled', color: '#3a86ff', order: 1 },
      { name: 'Checked In', color: '#4cc9f0', order: 2 },
      { name: 'Consultation', color: '#f8961e', order: 3 },
      { name: 'Diagnosis', color: '#f72585', order: 4 },
      { name: 'Treatment Plan', color: '#7209b7', order: 5 },
      { name: 'In Treatment', color: '#8b5cf6', order: 6 },
      { name: 'Follow-up Scheduled', color: '#06b6d4', order: 7 },
      { name: 'Completed', color: '#10b981', order: 8 }
    ]
  },
  {
    id: 'restaurant',
    name: 'Restaurant',
    description: 'Track reservations and dining experiences',
    icon: 'utensils',
    color: '#f97316',
    category: 'restaurant',
    stages: [
      { name: 'Reservation Made', color: '#3a86ff', order: 1 },
      { name: 'Arrived', color: '#4cc9f0', order: 2 },
      { name: 'Seated', color: '#f8961e', order: 3 },
      { name: 'Order Placed', color: '#f72585', order: 4 },
      { name: 'Preparing', color: '#7209b7', order: 5 },
      { name: 'Served', color: '#8b5cf6', order: 6 },
      { name: 'Payment', color: '#10b981', order: 7 },
      { name: 'Completed', color: '#059669', order: 8 }
    ]
  },
  {
    id: 'legal',
    name: 'Legal',
    description: 'Manage legal cases and client matters',
    icon: 'scale',
    color: '#6366f1',
    category: 'legal',
    stages: [
      { name: 'Initial Consultation', color: '#3a86ff', order: 1 },
      { name: 'Case Review', color: '#4cc9f0', order: 2 },
      { name: 'Engagement Letter', color: '#f8961e', order: 3 },
      { name: 'Discovery', color: '#f72585', order: 4 },
      { name: 'Negotiation', color: '#7209b7', order: 5 },
      { name: 'Court Proceedings', color: '#8b5cf6', order: 6 },
      { name: 'Settlement', color: '#10b981', order: 7 },
      { name: 'Closed', color: '#059669', order: 8 }
    ]
  },
  {
    id: 'education',
    name: 'Education',
    description: 'Track student enrollment and course progress',
    icon: 'graduation-cap',
    color: '#14b8a6',
    category: 'education',
    stages: [
      { name: 'Inquiry', color: '#3a86ff', order: 1 },
      { name: 'Application', color: '#4cc9f0', order: 2 },
      { name: 'Enrolled', color: '#f8961e', order: 3 },
      { name: 'In Progress', color: '#f72585', order: 4 },
      { name: 'Assessment', color: '#7209b7', order: 5 },
      { name: 'Completed', color: '#10b981', order: 6 },
      { name: 'Certified', color: '#059669', order: 7 }
    ]
  },
  {
    id: 'barbershop',
    name: 'Barbershop',
    description: 'Manage appointments and services for barbershop clients',
    icon: 'scissors',
    color: '#a855f7',
    category: 'barbershop',
    stages: [
      { name: 'Appointment Scheduled', color: '#3a86ff', order: 1 },
      { name: 'Checked In', color: '#4cc9f0', order: 2 },
      { name: 'Waiting', color: '#f8961e', order: 3 },
      { name: 'In Service', color: '#f72585', order: 4 },
      { name: 'Service Complete', color: '#7209b7', order: 5 },
      { name: 'Payment', color: '#10b981', order: 6 },
      { name: 'Completed', color: '#059669', order: 7 },
      { name: 'Next Appointment', color: '#06b6d4', order: 8 }
    ]
  },
  {
    id: 'salon',
    name: 'Beauty Salon',
    description: 'Track beauty salon appointments and services',
    icon: 'sparkles',
    color: '#f472b6',
    category: 'salon',
    stages: [
      { name: 'Appointment Booked', color: '#3a86ff', order: 1 },
      { name: 'Arrived', color: '#4cc9f0', order: 2 },
      { name: 'Consultation', color: '#f8961e', order: 3 },
      { name: 'Service In Progress', color: '#f72585', order: 4 },
      { name: 'Styling', color: '#7209b7', order: 5 },
      { name: 'Finished', color: '#8b5cf6', order: 6 },
      { name: 'Payment', color: '#10b981', order: 7 },
      { name: 'Completed', color: '#059669', order: 8 }
    ]
  },
  {
    id: 'spa',
    name: 'Spa & Wellness',
    description: 'Manage spa appointments and wellness treatments',
    icon: 'leaf',
    color: '#22c55e',
    category: 'spa',
    stages: [
      { name: 'Reservation Made', color: '#3a86ff', order: 1 },
      { name: 'Arrived', color: '#4cc9f0', order: 2 },
      { name: 'Check-in', color: '#f8961e', order: 3 },
      { name: 'Treatment Started', color: '#f72585', order: 4 },
      { name: 'In Progress', color: '#7209b7', order: 5 },
      { name: 'Treatment Complete', color: '#8b5cf6', order: 6 },
      { name: 'Payment', color: '#10b981', order: 7 },
      { name: 'Completed', color: '#059669', order: 8 }
    ]
  }
];

/**
 * Get a template by its ID
 */
export function getTemplateById(templateId: string): PipelineTemplate | undefined {
  return PIPELINE_TEMPLATES.find(template => template.id === templateId);
}

/**
 * Get templates by category
 */
export function getTemplatesByCategory(category: string): PipelineTemplate[] {
  return PIPELINE_TEMPLATES.filter(template => template.category === category);
}

/**
 * Format category name for display (e.g., "project_management" -> "Project Management")
 */
export function formatCategoryLabel(category: string): string {
  return category
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
