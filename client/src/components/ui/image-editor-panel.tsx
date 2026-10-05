import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import {
  Trash2,
  Lock,
  Unlock,
  RotateCcw,
  Move as TabIconMove,
  Palette as TabIconPalette,
  Scaling as TabIconScaling,
} from 'lucide-react';

interface ImageProperties {
  width: number;
  height: number;
  alt: string;
  alignment: 'left' | 'center' | 'right' | 'float-left' | 'float-right';
  opacity: number;
  borderWidth: number;
  borderColor: string;
  margin: number;
  padding: number;
  aspectRatioLocked: boolean;
}

interface ImageEditorPanelProps {
  image: HTMLImageElement | null;
  isVisible: boolean;
  onClose: () => void;
  onUpdate: (properties: Partial<ImageProperties>) => void;
  onDelete: () => void;
}

export function ImageEditorPanel({ image, isVisible, onClose, onUpdate, onDelete }: ImageEditorPanelProps) {
  const [properties, setProperties] = useState<ImageProperties>({
    width: 0,
    height: 0,
    alt: '',
    alignment: 'left',
    opacity: 100,
    borderWidth: 0,
    borderColor: '#000000',
    margin: 0,
    padding: 0,
    aspectRatioLocked: true
  });

  const [originalAspectRatio, setOriginalAspectRatio] = useState(1);

  useEffect(() => {
    if (image && isVisible) {
      const computedStyle = window.getComputedStyle(image);
      const currentWidth = parseInt(image.style.width) || image.offsetWidth;
      const currentHeight = parseInt(image.style.height) || image.offsetHeight;
      
      setOriginalAspectRatio(image.naturalWidth / image.naturalHeight);
      
      setProperties({
        width: currentWidth,
        height: currentHeight,
        alt: image.alt || '',
        alignment: getImageAlignment(image),
        opacity: Math.round((parseFloat(computedStyle.opacity) || 1) * 100),
        borderWidth: parseInt(computedStyle.borderWidth) || 0,
        borderColor: computedStyle.borderColor || '#000000',
        margin: parseInt(computedStyle.margin) || 0,
        padding: parseInt(computedStyle.padding) || 0,
        aspectRatioLocked: true
      });
    }
  }, [image, isVisible]);

  const getImageAlignment = (img: HTMLImageElement): ImageProperties['alignment'] => {
    const style = img.style;
    const computedStyle = window.getComputedStyle(img);
    
    if (style.float === 'left' || computedStyle.float === 'left') return 'float-left';
    if (style.float === 'right' || computedStyle.float === 'right') return 'float-right';
    if (style.textAlign === 'center' || computedStyle.textAlign === 'center') return 'center';
    if (style.textAlign === 'right' || computedStyle.textAlign === 'right') return 'right';
    
    return 'left';
  };

  const handlePropertyChange = (key: keyof ImageProperties, value: any) => {
    setProperties(prev => {
      const newProps = { ...prev, [key]: value };
      

      if (key === 'width' && prev.aspectRatioLocked) {
        newProps.height = Math.round(value / originalAspectRatio);
      } else if (key === 'height' && prev.aspectRatioLocked) {
        newProps.width = Math.round(value * originalAspectRatio);
      }
      
      return newProps;
    });
  };

  const applyChanges = () => {
    onUpdate(properties);
  };

  const resetToOriginal = () => {
    if (image) {
      const newProps = {
        width: image.naturalWidth,
        height: image.naturalHeight,
        opacity: 100,
        borderWidth: 0,
        margin: 0,
        padding: 0
      };
      setProperties(prev => ({ ...prev, ...newProps }));
      onUpdate(newProps);
    }
  };

  if (!isVisible || !image) return null;

  return (
    <Card className="image-editor-panel absolute top-4 right-4 w-80 z-[9999] shadow-lg border bg-white">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm">Image Properties</CardTitle>
          <div className="flex gap-1">
            <Button variant="ghost" size="sm" onClick={resetToOriginal}>
              <RotateCcw className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={onDelete}>
              <Trash2 className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={onClose}>
              ×
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <Tabs defaultValue="size" className="w-full">
          <TabsList>
            <TabsTrigger icon={TabIconScaling} value="size">Size</TabsTrigger>
            <TabsTrigger icon={TabIconPalette} value="style">Style</TabsTrigger>
            <TabsTrigger icon={TabIconMove} value="position">Position</TabsTrigger>
          </TabsList>
          
          <TabsContent value="size" className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="flex-1">
                <Label htmlFor="width" className="text-xs">Width (px)</Label>
                <Input
                  id="width"
                  type="number"
                  value={properties.width}
                  onChange={(e) => handlePropertyChange('width', parseInt(e.target.value) || 0)}
                  className="h-8"
                />
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handlePropertyChange('aspectRatioLocked', !properties.aspectRatioLocked)}
                className="mt-4"
              >
                {properties.aspectRatioLocked ? <Lock className="h-4 w-4" /> : <Unlock className="h-4 w-4" />}
              </Button>
              <div className="flex-1">
                <Label htmlFor="height" className="text-xs">Height (px)</Label>
                <Input
                  id="height"
                  type="number"
                  value={properties.height}
                  onChange={(e) => handlePropertyChange('height', parseInt(e.target.value) || 0)}
                  className="h-8"
                />
              </div>
            </div>
            
            <div>
              <Label htmlFor="alt" className="text-xs">Alt Text</Label>
              <Input
                id="alt"
                value={properties.alt}
                onChange={(e) => handlePropertyChange('alt', e.target.value)}
                placeholder="Describe the image..."
                className="h-8"
              />
            </div>
          </TabsContent>
          
          <TabsContent value="style" className="space-y-3">
            <div>
              <Label className="text-xs">Opacity: {properties.opacity}%</Label>
              <Slider
                value={[properties.opacity]}
                onValueChange={(value) => handlePropertyChange('opacity', value[0])}
                max={100}
                min={0}
                step={1}
                className="mt-1"
              />
            </div>
            
            <div>
              <Label htmlFor="border-width" className="text-xs">Border Width (px)</Label>
              <Input
                id="border-width"
                type="number"
                value={properties.borderWidth}
                onChange={(e) => handlePropertyChange('borderWidth', parseInt(e.target.value) || 0)}
                className="h-8"
              />
            </div>
            
            <div>
              <Label htmlFor="border-color" className="text-xs">Border Color</Label>
              <Input
                id="border-color"
                type="color"
                value={properties.borderColor}
                onChange={(e) => handlePropertyChange('borderColor', e.target.value)}
                className="h-8"
              />
            </div>
          </TabsContent>
          
          <TabsContent value="position" className="space-y-3">
            <div>
              <Label className="text-xs">Alignment</Label>
              <Select
                value={properties.alignment}
                onValueChange={(value) => handlePropertyChange('alignment', value)}
              >
                <SelectTrigger className="h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="left">Left</SelectItem>
                  <SelectItem value="center">Center</SelectItem>
                  <SelectItem value="right">Right</SelectItem>
                  <SelectItem value="float-left">Float Left</SelectItem>
                  <SelectItem value="float-right">Float Right</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <Label htmlFor="margin" className="text-xs">Margin (px)</Label>
              <Input
                id="margin"
                type="number"
                value={properties.margin}
                onChange={(e) => handlePropertyChange('margin', parseInt(e.target.value) || 0)}
                className="h-8"
              />
            </div>
          </TabsContent>
        </Tabs>
        
        <Button onClick={applyChanges} className="w-full h-8 text-xs">
          Apply Changes
        </Button>
      </CardContent>
    </Card>
  );
}
