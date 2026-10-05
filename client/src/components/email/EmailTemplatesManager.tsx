import React, { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import {
  Plus,
  Edit,
  Trash2,
  Copy,
  Eye,
  FileText,
  AlignLeft as TabIconAlignLeft,
  Code as TabIconCode,
} from 'lucide-react';
import { VariableInsertion } from '@/components/campaigns/VariableInsertion';

interface EmailTemplate {
  id: number;
  name: string;
  description?: string;
  category: string;
  subject: string;
  htmlContent?: string;
  plainTextContent?: string;
  variables: string[];
  isActive: boolean;
  usageCount: number;
  createdAt: string;
  updatedAt: string;
}

interface EmailTemplateFormData {
  name: string;
  description: string;
  category: string;
  subject: string;
  htmlContent: string;
  plainTextContent: string;
  variables: string[];
  isActive: boolean;
}

const TEMPLATE_CATEGORIES = [
  { value: 'general', label: 'General' },
  { value: 'welcome', label: 'Welcome' },
  { value: 'follow-up', label: 'Follow-up' },
  { value: 'support', label: 'Support' },
  { value: 'marketing', label: 'Marketing' },
  { value: 'notification', label: 'Notification' }
];

export function EmailTemplatesManager() {
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<EmailTemplate | null>(null);
  const [formData, setFormData] = useState<EmailTemplateFormData>({
    name: '',
    description: '',
    category: 'general',
    subject: '',
    htmlContent: '',
    plainTextContent: '',
    variables: [],
    isActive: true
  });
  const { toast } = useToast();


  const subjectRef = useRef<HTMLInputElement>(null);
  const htmlContentRef = useRef<HTMLTextAreaElement>(null);
  const plainTextContentRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    fetchTemplates();
  }, []);

  const fetchTemplates = async () => {
    try {
      const response = await fetch('/api/email-templates');
      const result = await response.json();
      
      if (result.success) {
        setTemplates(result.data);
      } else {
        toast({
          title: "Error",
          description: "Failed to fetch email templates",
          variant: "destructive"
        });
      }
    } catch (error) {
      console.error('Error fetching templates:', error);
      toast({
        title: "Error",
        description: "Failed to fetch email templates",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name.trim() || !formData.subject.trim()) {
      toast({
        title: "Error",
        description: "Name and subject are required",
        variant: "destructive"
      });
      return;
    }

    try {
      const url = editingTemplate 
        ? `/api/email-templates/${editingTemplate.id}`
        : '/api/email-templates';
      
      const method = editingTemplate ? 'PUT' : 'POST';
      
      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(formData)
      });

      const result = await response.json();
      
      if (result.success) {
        toast({
          title: "Success",
          description: editingTemplate ? 'Template updated successfully' : 'Template created successfully'
        });
        setIsDialogOpen(false);
        resetForm();
        fetchTemplates();
      } else {
        toast({
          title: "Error",
          description: result.error || 'Failed to save template',
          variant: "destructive"
        });
      }
    } catch (error) {
      console.error('Error saving template:', error);
      toast({
        title: "Error",
        description: 'Failed to save template',
        variant: "destructive"
      });
    }
  };

  const handleEdit = (template: EmailTemplate) => {
    setEditingTemplate(template);
    setFormData({
      name: template.name,
      description: template.description || '',
      category: template.category,
      subject: template.subject,
      htmlContent: template.htmlContent || '',
      plainTextContent: template.plainTextContent || '',
      variables: template.variables,
      isActive: template.isActive
    });
    setIsDialogOpen(true);
  };

  const handleDelete = async (templateId: number) => {
    if (!confirm('Are you sure you want to delete this template?')) {
      return;
    }

    try {
      const response = await fetch(`/api/email-templates/${templateId}`, {
        method: 'DELETE'
      });

      const result = await response.json();
      
      if (result.success) {
        toast({
          title: "Success",
          description: 'Template deleted successfully'
        });
        fetchTemplates();
      } else {
        toast({
          title: "Error",
          description: result.error || 'Failed to delete template',
          variant: "destructive"
        });
      }
    } catch (error) {
      console.error('Error deleting template:', error);
      toast({
        title: "Error",
        description: 'Failed to delete template',
        variant: "destructive"
      });
    }
  };

  const handleDuplicate = (template: EmailTemplate) => {
    setEditingTemplate(null);
    setFormData({
      name: `${template.name} (Copy)`,
      description: template.description || '',
      category: template.category,
      subject: template.subject,
      htmlContent: template.htmlContent || '',
      plainTextContent: template.plainTextContent || '',
      variables: template.variables,
      isActive: true
    });
    setIsDialogOpen(true);
  };

  const resetForm = () => {
    setEditingTemplate(null);
    setFormData({
      name: '',
      description: '',
      category: 'general',
      subject: '',
      htmlContent: '',
      plainTextContent: '',
      variables: [],
      isActive: true
    });
  };



  if (loading) {
    return <div className="flex justify-center p-8">Loading templates...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">Email Templates</h2>
          <p className="text-muted-foreground">Manage your email templates for quick message composition</p>
        </div>
        
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={resetForm}>
              <Plus className="w-4 h-4 mr-2" />
              New Template
            </Button>
          </DialogTrigger>
          
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {editingTemplate ? 'Edit Template' : 'Create New Template'}
              </DialogTitle>
            </DialogHeader>
            
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Template Name *</Label>
                  <Input data-tour="components-email-emailtemplatesmanager.input.name"
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="Enter template name"
                    required
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="category">Category</Label>
                  <Select value={formData.category} onValueChange={(value) => setFormData(prev => ({ ...prev, category: value }))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TEMPLATE_CATEGORIES.map(cat => (
                        <SelectItem key={cat.value} value={cat.value}>
                          {cat.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Input data-tour="components-email-emailtemplatesmanager.input.description"
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Brief description of the template"
                />
              </div>
              
              <div className="space-y-2">
                <div className="space-y-2">
                  <Label htmlFor="subject">Subject Line *</Label>
                  <Input data-tour="components-email-emailtemplatesmanager.input.subject"
                    ref={subjectRef}
                    id="subject"
                    value={formData.subject}
                    onChange={(e) => setFormData(prev => ({ ...prev, subject: e.target.value }))}
                    placeholder="Email subject line"
                    required
                  />
                  <div className="mt-1">
                    <VariableInsertion
                      textareaRef={subjectRef as any}
                      value={formData.subject}
                      onChange={(subject) => setFormData(prev => ({ ...prev, subject }))}
                      customVariables={['company', 'position', 'location', 'industry']}
                    />
                  </div>
                </div>
              </div>
              
              <Tabs defaultValue="html" className="w-full">
                <TabsList>
                  <TabsTrigger icon={TabIconCode} data-tour="components-email-emailtemplatesmanager.tabstrigger.html" value="html">HTML Content</TabsTrigger>
                  <TabsTrigger icon={TabIconAlignLeft} data-tour="components-email-emailtemplatesmanager.tabstrigger.plain" value="plain">Plain Text</TabsTrigger>
                </TabsList>
                
                <TabsContent data-tour="components-email-emailtemplatesmanager.tabscontent.html" value="html" className="space-y-2">
                  <div className="space-y-2">
                    <Label>HTML Content</Label>
                    <Textarea data-tour="components-email-emailtemplatesmanager.textarea.formData.htmlContent"
                      ref={htmlContentRef}
                      value={formData.htmlContent}
                      onChange={(e) => setFormData(prev => ({ ...prev, htmlContent: e.target.value }))}
                      placeholder="HTML email content with formatting"
                      rows={10}
                      className="font-mono text-sm"
                    />
                    <div className="mt-1">
                      <VariableInsertion
                        textareaRef={htmlContentRef}
                        value={formData.htmlContent}
                        onChange={(htmlContent) => setFormData(prev => ({ ...prev, htmlContent }))}
                        customVariables={['company', 'position', 'location', 'industry']}
                      />
                    </div>
                  </div>
                </TabsContent>
                
                <TabsContent data-tour="components-email-emailtemplatesmanager.tabscontent.plain" value="plain" className="space-y-2">
                  <div className="space-y-2">
                    <Label>Plain Text Content</Label>
                    <Textarea data-tour="components-email-emailtemplatesmanager.textarea.formData.plainTextContent"
                      ref={plainTextContentRef}
                      value={formData.plainTextContent}
                      onChange={(e) => setFormData(prev => ({ ...prev, plainTextContent: e.target.value }))}
                      placeholder="Plain text version of the email"
                      rows={10}
                    />
                    <div className="mt-1">
                      <VariableInsertion
                        textareaRef={plainTextContentRef}
                        value={formData.plainTextContent}
                        onChange={(plainTextContent) => setFormData(prev => ({ ...prev, plainTextContent }))}
                        customVariables={['company', 'position', 'location', 'industry']}
                      />
                    </div>
                  </div>
                </TabsContent>
              </Tabs>
              
              <div className="flex items-center space-x-2">
                <Switch
                  id="isActive"
                  checked={formData.isActive}
                  onCheckedChange={(checked) => setFormData(prev => ({ ...prev, isActive: checked }))}
                />
                <Label htmlFor="isActive">Active Template</Label>
              </div>
              
              <div className="flex justify-end space-x-2">
                <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit">
                  {editingTemplate ? 'Update Template' : 'Create Template'}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4">
        {templates.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <FileText className="w-12 h-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No Email Templates</h3>
              <p className="text-muted-foreground text-center mb-4">
                Create your first email template to speed up your email composition
              </p>
              <Button onClick={() => setIsDialogOpen(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Create Template
              </Button>
            </CardContent>
          </Card>
        ) : (
          templates.map((template) => (
            <Card key={template.id}>
              <CardHeader>
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      {template.name}
                      <Badge variant={template.isActive ? "default" : "secondary"}>
                        {template.isActive ? "Active" : "Inactive"}
                      </Badge>
                      <Badge variant="outline">
                        {TEMPLATE_CATEGORIES.find(cat => cat.value === template.category)?.label || template.category}
                      </Badge>
                    </CardTitle>
                    <CardDescription>
                      {template.description || 'No description'}
                    </CardDescription>
                  </div>
                  
                  <div className="flex space-x-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleEdit(template)}
                    >
                      <Edit className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDuplicate(template)}
                    >
                      <Copy className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDelete(template.id)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              
              <CardContent>
                <div className="space-y-2">
                  <div>
                    <strong>Subject:</strong> {template.subject}
                  </div>
                  
                  {template.variables.length > 0 && (
                    <div>
                      <strong>Variables:</strong>{' '}
                      {template.variables.map(variable => (
                        <Badge key={variable} variant="secondary" className="mr-1">
                          {`{{${variable}}}`}
                        </Badge>
                      ))}
                    </div>
                  )}
                  
                  <div className="text-sm text-muted-foreground">
                    Used {template.usageCount} times • Last updated {new Date(template.updatedAt).toLocaleDateString()}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
