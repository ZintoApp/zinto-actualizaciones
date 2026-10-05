import React, { useEffect, useRef, useState } from 'react';
import { useParams, useLocation } from 'wouter';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { Save, Eye, ArrowLeft } from 'lucide-react';
import { Link } from 'wouter';
import AdminLayout from '@/components/admin/AdminLayout';


import grapesjs from 'grapesjs';
import 'grapesjs/dist/css/grapes.min.css';
import fontAwesomeStylesheet from '@/assets/icons/font-awesome/css/font-awesome.min.css?inline';

interface Website {
  id: number;
  title: string;
  slug: string;
  description?: string;
  metaTitle?: string;
  metaDescription?: string;
  metaKeywords?: string;
  grapesData: any;
  grapesHtml?: string;
  grapesCss?: string;
  grapesJs?: string;
  favicon?: string;
  customCss?: string;
  customJs?: string;
  customHead?: string;
  status: 'draft' | 'published' | 'archived';
  googleAnalyticsId?: string;
  facebookPixelId?: string;
  templateId?: number;
  theme?: string;
  publishedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export default function WebsiteBuilderEditor() {
  const params = useParams();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const websiteId = params.id ? parseInt(params.id) : null;
  const isEditing = websiteId !== null;
  
  const editorRef = useRef<HTMLDivElement>(null);
  const studioRef = useRef<any>(null);
  
  const [websiteData, setWebsiteData] = useState({
    title: '',
    slug: '',
    description: '',
    metaTitle: '',
    metaDescription: '',
    metaKeywords: '',
    status: 'draft' as 'draft' | 'published' | 'archived',
    googleAnalyticsId: '',
    facebookPixelId: '',
    theme: 'default',
    customCss: '',
    customJs: '',
    customHead: '',
    favicon: ''
  });

  const [showSaveModal, setShowSaveModal] = useState(false);
  const [tempSaveData, setTempSaveData] = useState({
    title: '',
    slug: ''
  });


  const [showCustomHtmlModal, setShowCustomHtmlModal] = useState(false);
  const [customHtmlContent, setCustomHtmlContent] = useState('');
  const [currentCustomHtmlComponent, setCurrentCustomHtmlComponent] = useState<any>(null);


  const { data: website, isLoading } = useQuery<Website>({
    queryKey: ['admin-website', websiteId],
    queryFn: async () => {
      if (!websiteId) return null;
      const response = await fetch(`/api/admin/websites/${websiteId}`);
      if (!response.ok) {
        throw new Error('Failed to fetch website');
      }
      return response.json();
    },
    enabled: !!websiteId
  });


  useEffect(() => {

    if (!document.querySelector('style[data-app-font-awesome]')) {
      const fontAwesome = document.createElement('style');
      fontAwesome.textContent = fontAwesomeStylesheet;
      fontAwesome.dataset.appFontAwesome = 'true';
      document.head.appendChild(fontAwesome);
    }

    if (!editorRef.current) return;

    const initGrapeJS = () => {
      try {

        const editor = grapesjs.init({
          container: editorRef.current!,
          height: '100%',
          width: 'auto',
          storageManager: false, // We'll handle storage manually
          fromElement: false,


          components: website?.grapesHtml || '<h1>Welcome to your new website!</h1><p>Start building your amazing website here.</p>',
          style: website?.grapesCss || '',


          blockManager: {
            blocks: [
              {
                id: 'section',
                label: '<i class="fa fa-square-o"></i><br>Section',
                attributes: { class: 'gjs-block-section' },
                content: `<section>
                  <h1>Insert title here</h1>
                  <p>Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.</p>
                </section>`,
              },
              {
                id: 'text',
                label: '<i class="fa fa-text-width"></i><br>Text',
                content: { type: 'text', content: 'Insert your text here' },
              },
              {
                id: 'image',
                label: '<i class="fa fa-picture-o"></i><br>Image',
                select: true,
                content: { type: 'image' },
                activate: true,
              },
              {
                id: 'video',
                label: '<i class="fa fa-youtube-play"></i><br>Video',
                content: {
                  type: 'video',
                  src: 'https://www.youtube.com/embed/dQw4w9WgXcQ',
                  style: {
                    height: '350px',
                    width: '100%'
                  }
                },
              },
              {
                id: 'link',
                label: '<i class="fa fa-link"></i><br>Link',
                content: { type: 'link', content: 'Link Text', attributes: { href: '#' } },
              },
              {
                id: 'textnode',
                label: '<i class="fa fa-font"></i><br>Text Node',
                content: { type: 'textnode', content: 'Simple text' },
              },
              {
                id: 'comment',
                label: '<i class="fa fa-comment-o"></i><br>Comment',
                content: { type: 'comment', content: 'HTML Comment' },
              },
              {
                id: 'map',
                label: '<i class="fa fa-map-marker"></i><br>Map',
                content: {
                  type: 'map',
                  style: { height: '350px' }
                },
              },
              {
                id: 'wrapper',
                label: '<i class="fa fa-square-o"></i><br>Container',
                content: { type: 'wrapper' },
              },
              {
                id: 'default',
                label: '<i class="fa fa-square"></i><br>Box',
                content: { type: 'default', content: 'Insert content here' },
              },
              {
                id: 'row',
                label: '<i class="fa fa-columns"></i><br>Row',
                content: '<div class="row"><div class="cell">Column 1</div><div class="cell">Column 2</div></div>',
              },
              {
                id: 'column',
                label: '<i class="fa fa-square-o"></i><br>Column',
                content: '<div class="column">Column content</div>',
              },
              {
                id: 'custom-html',
                label: '<i class="fa fa-code"></i><br>Custom HTML',
                content: {
                  type: 'custom-html',
                  content: '<div class="custom-html-placeholder">Double-click to edit custom HTML</div>',
                  attributes: { 'data-custom-html': '' }
                },
              }
            ]
          }
        });


        editor.DomComponents.addType('custom-html', {
          model: {
            defaults: {
              tagName: 'div',
              attributes: { class: 'custom-html-component' },
              traits: [
                {
                  type: 'textarea',
                  name: 'html-content',
                  label: 'HTML Content',
                  placeholder: 'Enter your custom HTML here...',
                  changeProp: true,
                },
              ],
              content: '<div class="custom-html-placeholder">Double-click to edit custom HTML</div>',
            },

            init() {
              this.on('change:html-content', this.updateContent);


              const htmlContent = this.get('html-content');
              if (htmlContent) {
                this.updateContent();
              }


              this.on('component:add', () => {
                setTimeout(() => {
                  this.updateContent();

                  setTimeout(() => this.updateContent(), 500);
                }, 200);
              });
            },

            updateContent() {
              const htmlContent = this.get('html-content');
              if (htmlContent && htmlContent.trim()) {



                const isCompleteDocument = htmlContent.includes('<!doctype') || htmlContent.includes('<html');



                const scriptMatches = htmlContent.match(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi) || [];
                const styleMatches = htmlContent.match(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi) || [];





                let cleanHtml = htmlContent;


                const bodyMatch = htmlContent.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
                if (bodyMatch) {
                  cleanHtml = bodyMatch[1];
                }



                cleanHtml = cleanHtml
                  .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');


                cleanHtml = cleanHtml
                  .replace(/<!doctype[^>]*>/gi, '')
                  .replace(/<\/?html[^>]*>/gi, '')
                  .replace(/<\/?body[^>]*>/gi, '');


                const headMatch = htmlContent.match(/<head[\s\S]*?<\/head>/gi);
                if (headMatch) {
                  const headContent = headMatch[0];

                  const headStyles = headContent.match(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi) || [];
                  if (headStyles.length > 0) {
                    cleanHtml = headStyles.join('\n') + '\n' + cleanHtml.replace(/<head[\s\S]*?<\/head>/gi, '');
                  } else {
                    cleanHtml = cleanHtml.replace(/<head[\s\S]*?<\/head>/gi, '');
                  }
                } else {

                }


                this.components(cleanHtml.trim());


                const headMatchForMeta = htmlContent.match(/<head[\s\S]*?<\/head>/gi);



                if (headMatchForMeta) {
                  const headContent = headMatchForMeta[0];


                  const viewportMatch = headContent.match(/<meta[^>]*name\s*=\s*["']viewport["'][^>]*>/i);
                  if (viewportMatch) {
                    const existingViewport = document.querySelector('meta[name="viewport"]');
                    if (!existingViewport) {
                      const metaElement = document.createElement('meta');
                      const contentMatch = viewportMatch[0].match(/content\s*=\s*["']([^"']+)["']/i);
                      if (contentMatch) {
                        metaElement.name = 'viewport';
                        metaElement.content = contentMatch[1];
                        document.head.appendChild(metaElement);
                      }
                    }
                  }
                }


                let allStyles = [...styleMatches];


                if (headMatchForMeta) {
                  const headContentForStyles = headMatchForMeta[0];

                  const headStyleMatches = headContentForStyles.match(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi) || [];

                  allStyles = [...allStyles, ...headStyleMatches];
                }

                if (allStyles.length > 0) {

                  const existingStyles = document.querySelectorAll('[id^="custom-html-style-"]');
                  existingStyles.forEach(style => style.remove());




                  const editor = (window as any).grapesEditor;


                  const combinedCSS = allStyles.map(styleTag =>
                    styleTag.replace(/<style[^>]*>/, '').replace(/<\/style>/, '')
                  ).join('\n\n');


                  if (editor && combinedCSS.trim()) {
                    try {
                      const currentCSS = editor.getCss();
                      editor.setStyle(currentCSS + '\n\n' + combinedCSS);

                    } catch (e) {

                    }
                  }

                  allStyles.forEach((styleTag: string, index: number) => {
                    const styleContent = styleTag.replace(/<style[^>]*>/, '').replace(/<\/style>/, '');
                    if (styleContent.trim()) {



                      if (editor && editor.Css) {
                        try {
                          editor.Css.addRules(styleContent);

                        } catch (e) {

                        }
                      }


                      const styleId = 'custom-html-style-' + Math.random().toString(36).substring(2, 11);
                      const styleElement = document.createElement('style');
                      styleElement.id = styleId;



                      styleElement.textContent = styleContent;


                      const grapesFrame = document.querySelector('#gjs-cv-canvas iframe') as HTMLIFrameElement;

                      if (grapesFrame && grapesFrame.contentDocument) {

                        const frameHead = grapesFrame.contentDocument.head;
                        if (frameHead) {
                          const clonedStyle = styleElement.cloneNode(true) as HTMLStyleElement;
                          frameHead.appendChild(clonedStyle);

                        }
                      }


                      document.head.appendChild(styleElement);


                    }
                  });
                } else {



                  if (htmlContent.includes('<style')) {



                    if (isCompleteDocument) {
                      const styleStart = htmlContent.indexOf('<style');
                      const styleEnd = htmlContent.lastIndexOf('</style>') + 8;
                      if (styleStart !== -1 && styleEnd > styleStart) {
                        const styleSection = htmlContent.substring(styleStart, styleEnd);



                        const existingFallback = document.getElementById('custom-html-fallback-style');
                        if (existingFallback) {
                          existingFallback.remove();
                        }


                        const styleElement = document.createElement('style');
                        styleElement.id = 'custom-html-fallback-style';


                        const cssContent = styleSection.replace(/<style[^>]*>/gi, '').replace(/<\/style>/gi, '');
                        styleElement.textContent = cssContent;


                        const grapesFrame = document.querySelector('#gjs-cv-canvas iframe') as HTMLIFrameElement;
                        if (grapesFrame && grapesFrame.contentDocument) {
                          const frameHead = grapesFrame.contentDocument.head;
                          if (frameHead) {
                            const clonedStyle = styleElement.cloneNode(true) as HTMLStyleElement;
                            frameHead.appendChild(clonedStyle);

                          }
                        }


                        document.head.appendChild(styleElement);


                      }
                    }
                  }
                }


                let allScripts = [...scriptMatches];


                if (headMatch) {
                  const headContent = headMatch[0];
                  const headScriptMatches = headContent.match(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi) || [];
                  allScripts = [...headScriptMatches, ...allScripts]; // Head scripts first
                }


                if (allScripts.length > 0) {
                  setTimeout(() => {
                    allScripts.forEach((scriptTag: string) => {

                      const scriptContent = scriptTag.replace(/<script[^>]*>/, '').replace(/<\/script>/, '');


                      const srcMatch = scriptTag.match(/src\s*=\s*["']([^"']+)["']/i);

                      if (srcMatch) {

                        const scriptElement = document.createElement('script');
                        scriptElement.src = srcMatch[1];
                        scriptElement.async = true;
                        document.head.appendChild(scriptElement);
                      } else if (scriptContent.trim()) {

                        try {

                          const scriptElement = document.createElement('script');
                          scriptElement.textContent = scriptContent;


                          const scriptId = 'custom-html-script-' + Math.random().toString(36).substring(2, 11);
                          scriptElement.id = scriptId;


                          const existingScript = document.getElementById(scriptId);
                          if (!existingScript) {
                            document.body.appendChild(scriptElement);



                            /*
                            setTimeout(() => {
                              if (scriptElement.parentNode) {
                                scriptElement.parentNode.removeChild(scriptElement);
                              }
                            }, 1000);
                            */
                          }
                        } catch (error) {
                          console.error('Error executing custom JavaScript:', error);
                        }
                      }
                    });
                  }, 100);
                }
              } else {
                this.components('<div class="custom-html-placeholder">Double-click to edit custom HTML</div>');
              }
            },
          },

          view: {
            events: {
              'dblclick': 'openEditor',
            } as any,

            openEditor() {
              const htmlContent = this.model.get('html-content') || '';
              setCurrentCustomHtmlComponent(this.model);
              setCustomHtmlContent(htmlContent);
              setShowCustomHtmlModal(true);
            },
          },
        });


        editor.addStyle(`
          .row {
            display: flex;
            flex-wrap: wrap;
            margin: 0 -10px;
          }
          .cell {
            flex: 1;
            padding: 10px;
            min-height: 75px;
            background: #f8f9fa;
            border: 1px dashed #ddd;
            margin: 0 10px;
          }
          .btn {
            display: inline-block;
            padding: 8px 16px;
            background: #007cba;
            color: white;
            text-decoration: none;
            border-radius: 4px;
            border: none;
            cursor: pointer;
          }
          .text-box {
            padding: 15px;
            border: 1px solid #ddd;
            border-radius: 4px;
            background: #f9f9f9;
          }
          .quote {
            font-style: italic;
            border-left: 4px solid #007cba;
            padding-left: 15px;
            margin: 15px 0;
          }
          section {
            padding: 20px;
            margin: 10px 0;
          }
          section h1 {
            margin-bottom: 10px;
            color: #333;
          }
          section p {
            line-height: 1.6;
            color: #666;
          }
          .custom-html-component {
            position: relative;
          }
          .custom-html-placeholder {
            padding: 20px;
            border: 2px dashed #ccc;
            background-color: #f9f9f9;
            text-align: center;
            min-height: 100px;
            color: #666;
            font-style: italic;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
          }
          .custom-html-placeholder:hover {
            border-color: #007cba;
            background-color: #f0f8ff;
          }
        `);


        const blockStyle = document.createElement('style');
        blockStyle.textContent = `
          /* Block Manager Styling */
          .gjs-block {
            display: flex !important;
            flex-direction: column !important;
            align-items: center !important;
            justify-content: center !important;
            text-align: center !important;
            padding: 15px 10px !important;
            min-height: 80px !important;
          }

          .gjs-block i {
            font-size: 24px !important;
            margin-bottom: 8px !important;
            display: block !important;
            color: #bbb !important;
          }

          .gjs-block:hover i {
            color: #007cba !important;
          }

          .gjs-block {
            font-size: 12px !important;
            font-weight: 500 !important;
            color: #fff !important;
            line-height: 1.2 !important;
          }

          .gjs-block:hover {
            color: #333 !important;
          }

          .gjs-block:hover {
            background-color: #f0f8ff !important;
            border-color: #007cba !important;
          }
        `;
        document.head.appendChild(blockStyle);




        if (website?.grapesData && Object.keys(website.grapesData).length > 0) {
          try {
            editor.loadProjectData(website.grapesData);
          } catch (error) {
            console.warn('Failed to load existing project data:', error);
          }
        }

        studioRef.current = editor;

        (window as any).grapesEditor = editor;


      } catch (error) {
        console.error('Failed to initialize GrapeJS:', error);
        toast({
          title: 'Error',
          description: 'Failed to initialize the website builder. Please try again.',
          variant: 'destructive'
        });
      }
    };

    initGrapeJS();

    return () => {
      if (studioRef.current) {
        try {
          studioRef.current.destroy();
        } catch (error) {
          console.warn('Error destroying GrapeJS:', error);
        }
      }
    };
  }, [website, toast]);


  useEffect(() => {
    if (website) {
      setWebsiteData({
        title: website.title || '',
        slug: website.slug || '',
        description: website.description || '',
        metaTitle: website.metaTitle || '',
        metaDescription: website.metaDescription || '',
        metaKeywords: website.metaKeywords || '',
        status: website.status || 'draft',
        googleAnalyticsId: website.googleAnalyticsId || '',
        facebookPixelId: website.facebookPixelId || '',
        theme: website.theme || 'default',
        customCss: website.customCss || '',
        customJs: website.customJs || '',
        customHead: website.customHead || '',
        favicon: website.favicon || ''
      });
    }
  }, [website]);


  const saveWebsiteMutation = useMutation({
    mutationFn: async (data: any) => {
      const url = isEditing ? `/api/admin/websites/${websiteId}` : '/api/admin/websites';
      const method = isEditing ? 'PUT' : 'POST';
      
      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(data)
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to save website');
      }
      
      return response.json();
    },
    onSuccess: (savedWebsite) => {
      queryClient.invalidateQueries({ queryKey: ['admin-websites'] });
      queryClient.invalidateQueries({ queryKey: ['admin-website', websiteId] });
      
      toast({
        title: 'Success',
        description: `Website ${isEditing ? 'updated' : 'created'} successfully`
      });
      
      if (!isEditing) {
        setLocation(`/admin/website-builder/edit/${savedWebsite.id}`);
      }
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to save website',
        variant: 'destructive'
      });
    }
  });

  const handleSave = async () => {

    if (!isEditing && (!websiteData.title || !websiteData.slug)) {
      setShowSaveModal(true);
      return;
    }


    if (!websiteData.title || !websiteData.slug) {
      toast({
        title: 'Validation Error',
        description: 'Title and slug are required',
        variant: 'destructive'
      });
      return;
    }

    performSave();
  };

  const performSave = async (overrideData = {}) => {

    let grapesData = {};
    let grapesHtml = '';
    let grapesCss = '';
    let grapesJs = '';


    if (studioRef.current) {
      try {

        grapesData = studioRef.current.getProjectData();


        grapesHtml = studioRef.current.getHtml();
        grapesCss = studioRef.current.getCss();
        grapesJs = studioRef.current.getJs();
      } catch (error) {
        console.error('Error getting GrapeJS data:', error);
      }
    }

    const saveData = {
      ...websiteData,
      ...overrideData,
      grapesData,
      grapesHtml,
      grapesCss,
      grapesJs
    };

    saveWebsiteMutation.mutate(saveData);
  };

  const handleModalSave = () => {
    if (!tempSaveData.title || !tempSaveData.slug) {
      toast({
        title: 'Validation Error',
        description: 'Title and slug are required',
        variant: 'destructive'
      });
      return;
    }


    setWebsiteData(prev => ({
      ...prev,
      title: tempSaveData.title,
      slug: tempSaveData.slug
    }));

    setShowSaveModal(false);


    performSave({
      title: tempSaveData.title,
      slug: tempSaveData.slug
    });
  };

  const handlePreview = () => {
    if (website?.status === 'published') {
      window.open('/website', '_blank');
    } else {
      toast({
        title: 'Preview Unavailable',
        description: 'Please publish the website first to preview it',
        variant: 'destructive'
      });
    }
  };


  const handleCustomHtmlSave = () => {
    if (currentCustomHtmlComponent) {
      currentCustomHtmlComponent.set('html-content', customHtmlContent);
      setShowCustomHtmlModal(false);
      setCurrentCustomHtmlComponent(null);
      setCustomHtmlContent('');
    }
  };

  const handleCustomHtmlCancel = () => {
    setShowCustomHtmlModal(false);
    setCurrentCustomHtmlComponent(null);
    setCustomHtmlContent('');
  };

  if (isLoading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center h-screen">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p>Loading website builder...</p>
          </div>
        </div>
      </AdminLayout>
    );
  }

  return (
    <>

      <div className="h-screen flex flex-col">
        {/* Custom Header for Save/Preview */}
        <div className="bg-white border-b px-4 py-2 flex items-center justify-between relative z-50">
          <div className="flex items-center gap-4">
            <Link href="/admin/website-builder">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back
              </Button>
            </Link>
            <div>
              <h1 className="text-lg font-semibold">
                {isEditing ? `Edit: ${website?.title}` : 'New Website'}
              </h1>
              <p className="text-sm text-gray-600">
                {isEditing ? `/${website?.slug}` : 'Create a new website'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handlePreview}
              disabled={!website?.status || website.status !== 'published'}
            >
              <Eye className="w-4 h-4 mr-2" />
              Preview
            </Button>
            <Button
              size="sm"
              onClick={handleSave}
              disabled={saveWebsiteMutation.isPending}
            >
              <Save className="w-4 h-4 mr-2" />
              {saveWebsiteMutation.isPending ? 'Saving...' : 'Save'}
            </Button>
          </div>
        </div>

        {/* GrapeJS Editor - Let it handle its own default layout */}
        <div className="flex-1">
          <div ref={editorRef} className="h-full w-full"></div>
        </div>
      </div>

      {/* Save Modal for New Websites */}
      {showSaveModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-96 max-w-md">
            <h3 className="text-lg font-semibold mb-4">Save Website</h3>
            <div className="space-y-4">
              <div>
                <Label htmlFor="title">Website Title *</Label>
                <Input
                  id="title"
                  value={tempSaveData.title}
                  onChange={(e) => setTempSaveData(prev => ({ ...prev, title: e.target.value }))}
                  placeholder="Enter website title"
                />
              </div>
              <div>
                <Label htmlFor="slug">URL Slug *</Label>
                <Input
                  id="slug"
                  value={tempSaveData.slug}
                  onChange={(e) => setTempSaveData(prev => ({ ...prev, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-') }))}
                  placeholder="enter-url-slug"
                />
                <p className="text-sm text-gray-500 mt-1">This will be your website URL</p>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <Button
                variant="outline"
                onClick={() => setShowSaveModal(false)}
              >
                Cancel
              </Button>
              <Button
                onClick={handleModalSave}
                disabled={!tempSaveData.title || !tempSaveData.slug}
              >
                Save Website
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Custom HTML Editor Modal */}
      {showCustomHtmlModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-4xl max-h-[80vh] flex flex-col">
            <h3 className="text-lg font-semibold mb-4">Edit Custom HTML/CSS/JS</h3>
            <div className="flex-1 min-h-0">
              <Label htmlFor="custom-html-textarea" className="block mb-2">HTML/CSS/JavaScript Content</Label>
              <textarea
                id="custom-html-textarea"
                value={customHtmlContent}
                onChange={(e) => setCustomHtmlContent(e.target.value)}
                placeholder={`Paste your HTML code here - complete documents or snippets are supported!

Examples:

1. Complete HTML document:
<!DOCTYPE html>
<html>
<head>
  <style>body { font-family: Arial; }</style>
</head>
<body>
  <h1>My Page</h1>
</body>
</html>

2. HTML snippet:
<div id="widget">
  <h2>Interactive Widget</h2>
  <button onclick="alert('Hello!')">Click me</button>
</div>
<style>#widget { padding: 20px; }</style>`}
                className="w-full h-full min-h-[400px] p-3 border border-gray-300 rounded-md font-mono text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                style={{ fontFamily: 'Monaco, Menlo, "Ubuntu Mono", monospace' }}
              />
            </div>
            <div className="flex justify-between items-center mt-4 pt-4 border-t">
              <div className="text-sm text-gray-500">
                <p>• Complete HTML documents are supported (with &lt;html&gt;, &lt;head&gt;, &lt;body&gt;)</p>
                <p>• CSS from &lt;style&gt; tags and head section will be applied</p>
                <p>• JavaScript from &lt;script&gt; tags will be executed</p>
                <p>• Meta tags (viewport, etc.) will be preserved</p>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={handleCustomHtmlCancel}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleCustomHtmlSave}
                >
                  Apply HTML
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
