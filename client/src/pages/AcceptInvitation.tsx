import React, { useState, useEffect } from 'react';
import { useLocation, useRoute } from 'wouter';
import { useMutation, useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from '@/hooks/use-translation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, CheckCircle, XCircle, UserPlus } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface InvitationData {
  id: number;
  email: string;
  role: string;
  invitedByUserId: number;
  status: string;
  expiresAt: string;
  createdAt: string;
}

export default function AcceptInvitation() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { t } = useTranslation();
  const [token, setToken] = useState<string>('');
  const [formData, setFormData] = useState({
    username: '',
    password: '',
    confirmPassword: '',
    fullName: ''
  });
  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const tokenParam = urlParams.get('token');
    if (tokenParam) {
      setToken(tokenParam);
    }
  }, []);

  const { data: invitation, isLoading: isLoadingInvitation, error: invitationError } = useQuery<InvitationData>({
    queryKey: ['invitation', token],
    queryFn: async () => {
      if (!token) throw new Error('No token provided');
      
      const res = await apiRequest('GET', `/api/team/invitations/verify?token=${token}`);
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || 'Failed to verify invitation');
      }
      return res.json();
    },
    enabled: !!token,
    retry: false
  });

  const acceptInvitationMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const res = await apiRequest('POST', '/api/team/invitations/accept', {
        token,
        username: data.username,
        password: data.password,
        fullName: data.fullName
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || 'Failed to accept invitation');
      }

      return res.json();
    },
    onSuccess: (user) => {
      toast({
        title: t('auth.welcome_team', 'Welcome to the team!'),
        description: t('auth.account_created_success', 'Your account has been created successfully. You are now logged in.'),
      });

      setLocation('/');
    },
    onError: (error: Error) => {
      toast({
        title: t('common.error', 'Error'),
        description: error.message,
        variant: 'destructive',
      });
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const errors: string[] = [];

    if (!formData.username || formData.username.length < 3) {
      errors.push(t('auth.validation.username_min_length', 'Username must be at least 3 characters long'));
    }

    if (!formData.password || formData.password.length < 6) {
      errors.push(t('auth.validation.password_min_length', 'Password must be at least 6 characters long'));
    }

    if (formData.password !== formData.confirmPassword) {
      errors.push(t('auth.validation.passwords_no_match', 'Passwords do not match'));
    }

    if (!formData.fullName || formData.fullName.trim().length === 0) {
      errors.push(t('auth.validation.full_name_required', 'Full name is required'));
    }
    
    setValidationErrors(errors);
    
    if (errors.length === 0) {
      acceptInvitationMutation.mutate(formData);
    }
  };

  const handleInputChange = (field: keyof typeof formData) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData(prev => ({
      ...prev,
      [field]: e.target.value
    }));
    
    if (validationErrors.length > 0) {
      setValidationErrors([]);
    }
  };

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <div className="text-center">
              <XCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
              <h2 className="text-lg font-semibold text-gray-900 mb-2">{t('auth.invalid_invitation_title', 'Invalid Invitation Link')}</h2>
              <p className="text-gray-600 mb-4">
                {t('auth.invalid_invitation_desc', 'The invitation link is missing or invalid. Please check your email and try again.')}
              </p>
              <Button onClick={() => setLocation('/auth')} variant="outline">
                {t('auth.go_to_login', 'Go to Login')}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isLoadingInvitation) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <div className="text-center">
              <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
              <p className="text-gray-600">{t('auth.verifying_invitation', 'Verifying invitation...')}</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (invitationError || !invitation) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <div className="text-center">
              <XCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
              <h2 className="text-lg font-semibold text-gray-900 mb-2">{t('auth.invitation_not_found_title', 'Invitation Not Found')}</h2>
              <p className="text-gray-600 mb-4">
                {invitationError?.message || t('auth.invitation_not_found_desc', 'This invitation link is invalid, expired, or has already been used.')}
              </p>
              <Button onClick={() => setLocation('/auth')} variant="outline">
                {t('auth.go_to_login', 'Go to Login')}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4">
            <UserPlus className="h-12 w-12 text-blue-600" />
          </div>
          <CardTitle className="text-2xl">{t('auth.accept_invitation_title', 'Accept Team Invitation')}</CardTitle>
          <CardDescription>
            {t('auth.invited_as_role', 'You\'ve been invited to join as a {{role}}', { role: invitation.role })}
            <br />
            <span className="text-sm text-gray-500">{invitation.email}</span>
          </CardDescription>
        </CardHeader>
        
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Validation Errors */}
            {validationErrors.length > 0 && (
              <Alert variant="destructive">
                <AlertDescription>
                  <ul className="list-disc list-inside space-y-1">
                    {validationErrors.map((error, index) => (
                      <li key={index}>{error}</li>
                    ))}
                  </ul>
                </AlertDescription>
              </Alert>
            )}

            <div className="space-y-2">
              <Label htmlFor="fullName">{t('auth.full_name', 'Full Name')}</Label>
              <Input
                id="fullName"
                type="text"
                placeholder={t('auth.enter_full_name', 'Enter your full name')}
                value={formData.fullName}
                onChange={handleInputChange('fullName')}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="username">{t('auth.username', 'Username')}</Label>
              <Input
                id="username"
                type="text"
                placeholder={t('auth.choose_username', 'Choose a username')}
                value={formData.username}
                onChange={handleInputChange('username')}
                required
                minLength={3}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">{t('auth.password', 'Password')}</Label>
              <Input
                id="password"
                type="password"
                placeholder={t('auth.create_password', 'Create a password')}
                value={formData.password}
                onChange={handleInputChange('password')}
                required
                minLength={6}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword">{t('auth.confirm_password', 'Confirm Password')}</Label>
              <Input
                id="confirmPassword"
                type="password"
                placeholder={t('auth.confirm_password_placeholder', 'Confirm your password')}
                value={formData.confirmPassword}
                onChange={handleInputChange('confirmPassword')}
                required
              />
            </div>

            <Button 
              type="submit" 
              className="w-full" 
              disabled={acceptInvitationMutation.isPending}
            >
              {acceptInvitationMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  {t('auth.creating_account', 'Creating Account...')}
                </>
              ) : (
                <>
                  <CheckCircle className="h-4 w-4 mr-2" />
                  {t('auth.accept_invitation_button', 'Accept Invitation & Create Account')}
                </>
              )}
            </Button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-xs text-gray-500">
              {t('auth.invitation_agreement', 'By accepting this invitation, you agree to join the team and follow the company\'s policies.')}
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
