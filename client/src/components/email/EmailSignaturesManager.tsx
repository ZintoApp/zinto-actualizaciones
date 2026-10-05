import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
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
  Star,
  FileSignature,
  AlignLeft as TabIconAlignLeft,
  Code as TabIconCode,
} from 'lucide-react';

interface EmailSignature {
  id: number;
  name: string;
  htmlContent?: string;
  plainTextContent?: string;
  isDefault: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface EmailSignatureFormData {
  name: string;
  htmlContent: string;
  plainTextContent: string;
  isDefault: boolean;
  isActive: boolean;
}

export function EmailSignaturesManager() {
  const [signatures, setSignatures] = useState<EmailSignature[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingSignature, setEditingSignature] = useState<EmailSignature | null>(null);
  const [formData, setFormData] = useState<EmailSignatureFormData>({
    name: '',
    htmlContent: '',
    plainTextContent: '',
    isDefault: false,
    isActive: true
  });
  const { toast } = useToast();

  useEffect(() => {
    fetchSignatures();
  }, []);

  const fetchSignatures = async () => {
    try {
      const response = await fetch('/api/email-signatures');
      const result = await response.json();
      
      if (result.success) {
        setSignatures(result.data);
      } else {
        toast({
          title: "Error",
          description: "Failed to fetch email signatures",
          variant: "destructive"
        });
      }
    } catch (error) {
      console.error('Error fetching signatures:', error);
      toast({
        title: "Error",
        description: "Failed to fetch email signatures",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name.trim()) {
      toast({
        title: "Error",
        description: "Signature name is required",
        variant: "destructive"
      });
      return;
    }

    if (!formData.htmlContent.trim() && !formData.plainTextContent.trim()) {
      toast({
        title: "Error",
        description: "Either HTML content or plain text content is required",
        variant: "destructive"
      });
      return;
    }

    try {
      const url = editingSignature 
        ? `/api/email-signatures/${editingSignature.id}`
        : '/api/email-signatures';
      
      const method = editingSignature ? 'PUT' : 'POST';
      
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
          description: editingSignature ? 'Signature updated successfully' : 'Signature created successfully'
        });
        setIsDialogOpen(false);
        resetForm();
        fetchSignatures();
      } else {
        toast({
          title: "Error",
          description: result.error || 'Failed to save signature',
          variant: "destructive"
        });
      }
    } catch (error) {
      console.error('Error saving signature:', error);
      toast({
        title: "Error",
        description: 'Failed to save signature',
        variant: "destructive"
      });
    }
  };

  const handleEdit = (signature: EmailSignature) => {
    setEditingSignature(signature);
    setFormData({
      name: signature.name,
      htmlContent: signature.htmlContent || '',
      plainTextContent: signature.plainTextContent || '',
      isDefault: signature.isDefault,
      isActive: signature.isActive
    });
    setIsDialogOpen(true);
  };

  const handleDelete = async (signatureId: number) => {
    if (!confirm('Are you sure you want to delete this signature?')) {
      return;
    }

    try {
      const response = await fetch(`/api/email-signatures/${signatureId}`, {
        method: 'DELETE'
      });

      const result = await response.json();
      
      if (result.success) {
        toast({
          title: "Success",
          description: 'Signature deleted successfully'
        });
        fetchSignatures();
      } else {
        toast({
          title: "Error",
          description: result.error || 'Failed to delete signature',
          variant: "destructive"
        });
      }
    } catch (error) {
      console.error('Error deleting signature:', error);
      toast({
        title: "Error",
        description: 'Failed to delete signature',
        variant: "destructive"
      });
    }
  };

  const handleSetDefault = async (signatureId: number) => {
    try {
      const response = await fetch(`/api/email-signatures/${signatureId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ isDefault: true })
      });

      const result = await response.json();
      
      if (result.success) {
        toast({
          title: "Success",
          description: 'Default signature updated'
        });
        fetchSignatures();
      } else {
        toast({
          title: "Error",
          description: result.error || 'Failed to set default signature',
          variant: "destructive"
        });
      }
    } catch (error) {
      console.error('Error setting default signature:', error);
      toast({
        title: "Error",
        description: 'Failed to set default signature',
        variant: "destructive"
      });
    }
  };

  const resetForm = () => {
    setEditingSignature(null);
    setFormData({
      name: '',
      htmlContent: '',
      plainTextContent: '',
      isDefault: false,
      isActive: true
    });
  };

  if (loading) {
    return <div className="flex justify-center p-8">Loading signatures...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">Email Signatures</h2>
          <p className="text-muted-foreground">Manage your email signatures for professional communication</p>
        </div>
        
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={resetForm}>
              <Plus className="w-4 h-4 mr-2" />
              New Signature
            </Button>
          </DialogTrigger>
          
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {editingSignature ? 'Edit Signature' : 'Create New Signature'}
              </DialogTitle>
            </DialogHeader>
            
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="name">Signature Name *</Label>
                <Input data-tour="components-email-emailsignaturesmanager.input.name"
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="Enter signature name (e.g., Professional, Casual)"
                  required
                />
              </div>
              
              <Tabs defaultValue="html" className="w-full">
                <TabsList>
                  <TabsTrigger icon={TabIconCode} data-tour="components-email-emailsignaturesmanager.tabstrigger.html" value="html">HTML Signature</TabsTrigger>
                  <TabsTrigger icon={TabIconAlignLeft} data-tour="components-email-emailsignaturesmanager.tabstrigger.plain" value="plain">Plain Text</TabsTrigger>
                </TabsList>
                
                <TabsContent data-tour="components-email-emailsignaturesmanager.tabscontent.html" value="html" className="space-y-2">
                  <Label>HTML Signature</Label>
                  <Textarea data-tour="components-email-emailsignaturesmanager.textarea.formData.htmlContent"
                    value={formData.htmlContent}
                    onChange={(e) => setFormData(prev => ({ ...prev, htmlContent: e.target.value }))}
                    placeholder="HTML signature with formatting (e.g., <br>Best regards,<br><strong>Your Name</strong>)"
                    rows={8}
                    className="font-mono text-sm"
                  />
                  <p className="text-sm text-muted-foreground">
                    Use HTML tags for formatting. Example: &lt;br&gt; for line breaks, &lt;strong&gt; for bold text
                  </p>
                </TabsContent>
                
                <TabsContent data-tour="components-email-emailsignaturesmanager.tabscontent.plain" value="plain" className="space-y-2">
                  <Label>Plain Text Signature</Label>
                  <Textarea data-tour="components-email-emailsignaturesmanager.textarea.formData.plainTextContent"
                    value={formData.plainTextContent}
                    onChange={(e) => setFormData(prev => ({ ...prev, plainTextContent: e.target.value }))}
                    placeholder="Plain text version of your signature"
                    rows={8}
                  />
                  <p className="text-sm text-muted-foreground">
                    Plain text version for email clients that don't support HTML
                  </p>
                </TabsContent>
              </Tabs>
              
              <div className="flex items-center space-x-4">
                <div className="flex items-center space-x-2">
                  <Switch
                    id="isDefault"
                    checked={formData.isDefault}
                    onCheckedChange={(checked) => setFormData(prev => ({ ...prev, isDefault: checked }))}
                  />
                  <Label htmlFor="isDefault">Set as Default Signature</Label>
                </div>
                
                <div className="flex items-center space-x-2">
                  <Switch
                    id="isActive"
                    checked={formData.isActive}
                    onCheckedChange={(checked) => setFormData(prev => ({ ...prev, isActive: checked }))}
                  />
                  <Label htmlFor="isActive">Active</Label>
                </div>
              </div>
              
              <div className="flex justify-end space-x-2">
                <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit">
                  {editingSignature ? 'Update Signature' : 'Create Signature'}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4">
        {signatures.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <FileSignature className="w-12 h-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No Email Signatures</h3>
              <p className="text-muted-foreground text-center mb-4">
                Create your first email signature for professional communication
              </p>
              <Button onClick={() => setIsDialogOpen(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Create Signature
              </Button>
            </CardContent>
          </Card>
        ) : (
          signatures.map((signature) => (
            <Card key={signature.id}>
              <CardHeader>
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      {signature.name}
                      {signature.isDefault && (
                        <Badge variant="default" className="flex items-center gap-1">
                          <Star className="w-3 h-3" />
                          Default
                        </Badge>
                      )}
                      <Badge variant={signature.isActive ? "default" : "secondary"}>
                        {signature.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </CardTitle>
                    <CardDescription>
                      Created {new Date(signature.createdAt).toLocaleDateString()}
                    </CardDescription>
                  </div>
                  
                  <div className="flex space-x-2">
                    {!signature.isDefault && signature.isActive && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleSetDefault(signature.id)}
                        title="Set as default"
                      >
                        <Star className="w-4 h-4" />
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleEdit(signature)}
                    >
                      <Edit className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDelete(signature.id)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              
              <CardContent>
                <div className="space-y-4">
                  {signature.htmlContent && (
                    <div>
                      <strong className="text-sm">HTML Preview:</strong>
                      <div 
                        className="mt-1 p-3 border rounded-md bg-muted/50 text-sm"
                        dangerouslySetInnerHTML={{ __html: signature.htmlContent }}
                      />
                    </div>
                  )}
                  
                  {signature.plainTextContent && (
                    <div>
                      <strong className="text-sm">Plain Text:</strong>
                      <div className="mt-1 p-3 border rounded-md bg-muted/50 text-sm whitespace-pre-wrap font-mono">
                        {signature.plainTextContent}
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
