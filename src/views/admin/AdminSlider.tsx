"use client";

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import AdminLayout from '@/components/admin/AdminLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { Plus, Trash2, ArrowUp, ArrowDown, Loader2, Image, Upload, Monitor, Smartphone } from 'lucide-react';

interface MobileSlide {
  id: string;
  image_url: string;
  title: string | null;
  subtitle: string | null;
  cta_text: string | null;
  cta_link: string | null;
  display_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

const AdminSlider = () => {
  const queryClient = useQueryClient();
  const [uploading, setUploading] = useState(false);
  const [newSlide, setNewSlide] = useState({
    title: '',
    subtitle: '',
    cta_text: 'Browse Products',
    cta_link: '/products',
    image_url: '',
  });
  const [newMobileSlide, setNewMobileSlide] = useState({
    title: '',
    subtitle: '',
    cta_text: 'Browse Products',
    cta_link: '/products',
    image_url: '',
  });

  const { data: slides, isLoading } = useQuery({
    queryKey: ['admin-slider-images'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('slider_images')
        .select('*')
        .order('display_order', { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  const { data: mobileSlides, isLoading: mobileLoading } = useQuery({
    queryKey: ['admin-mobile-slider-images'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('mobile_slider_images' as any)
        .select('*')
        .order('display_order', { ascending: true });
      if (error) throw error;
      return data as unknown as MobileSlide[];
    },
  });

  const uploadImage = async (file: File) => {
    setUploading(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `slider-${Date.now()}.${fileExt}`;
      const { error: uploadError } = await supabase.storage
        .from('slider-images')
        .upload(fileName, file);
      if (uploadError) throw uploadError;
      const { data: { publicUrl } } = supabase.storage
        .from('slider-images')
        .getPublicUrl(fileName);
      return publicUrl;
    } finally {
      setUploading(false);
    }
  };

  const invalidateSliders = () => {
    queryClient.invalidateQueries({ queryKey: ['admin-slider-images'] });
    queryClient.invalidateQueries({ queryKey: ['slider-images'] });
    queryClient.invalidateQueries({ queryKey: ['admin-mobile-slider-images'] });
    queryClient.invalidateQueries({ queryKey: ['mobile-slider-images'] });
  };

  // Desktop slide mutations
  const addSlideMutation = useMutation({
    mutationFn: async (imageUrl: string) => {
      const maxOrder = slides?.length ? Math.max(...slides.map(s => s.display_order)) + 1 : 0;
      const { error } = await supabase.from('slider_images').insert({
        image_url: imageUrl,
        title: newSlide.title || null,
        subtitle: newSlide.subtitle || null,
        cta_text: newSlide.cta_text,
        cta_link: newSlide.cta_link,
        display_order: maxOrder,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateSliders();
      setNewSlide({ title: '', subtitle: '', cta_text: 'Browse Products', cta_link: '/products', image_url: '' });
      toast.success('Slide added');
    },
    onError: () => toast.error('Failed to add slide'),
  });

  const deleteSlideMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('slider_images').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { invalidateSliders(); toast.success('Slide removed'); },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase.from('slider_images').update({ is_active }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => invalidateSliders(),
  });

  const reorderMutation = useMutation({
    mutationFn: async ({ id, direction }: { id: string; direction: 'up' | 'down' }) => {
      if (!slides) return;
      const idx = slides.findIndex(s => s.id === id);
      const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
      if (swapIdx < 0 || swapIdx >= slides.length) return;
      const currentOrder = slides[idx].display_order;
      const swapOrder = slides[swapIdx].display_order;
      await supabase.from('slider_images').update({ display_order: swapOrder }).eq('id', slides[idx].id);
      await supabase.from('slider_images').update({ display_order: currentOrder }).eq('id', slides[swapIdx].id);
    },
    onSuccess: () => invalidateSliders(),
  });

  // Mobile slide mutations
  const addMobileSlideMutation = useMutation({
    mutationFn: async (imageUrl: string) => {
      const maxOrder = mobileSlides?.length ? Math.max(...mobileSlides.map(s => s.display_order)) + 1 : 0;
      const { error } = await (supabase.from('mobile_slider_images' as any) as any).insert({
        image_url: imageUrl,
        title: newMobileSlide.title || null,
        subtitle: newMobileSlide.subtitle || null,
        cta_text: newMobileSlide.cta_text,
        cta_link: newMobileSlide.cta_link,
        display_order: maxOrder,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateSliders();
      setNewMobileSlide({ title: '', subtitle: '', cta_text: 'Browse Products', cta_link: '/products', image_url: '' });
      toast.success('Mobile slide added');
    },
    onError: () => toast.error('Failed to add mobile slide'),
  });

  const deleteMobileSlideMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase.from('mobile_slider_images' as any) as any).delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { invalidateSliders(); toast.success('Mobile slide removed'); },
  });

  const toggleMobileActiveMutation = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await (supabase.from('mobile_slider_images' as any) as any).update({ is_active }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => invalidateSliders(),
  });

  const reorderMobileMutation = useMutation({
    mutationFn: async ({ id, direction }: { id: string; direction: 'up' | 'down' }) => {
      if (!mobileSlides) return;
      const idx = mobileSlides.findIndex(s => s.id === id);
      const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
      if (swapIdx < 0 || swapIdx >= mobileSlides.length) return;
      const currentOrder = mobileSlides[idx].display_order;
      const swapOrder = mobileSlides[swapIdx].display_order;
      await (supabase.from('mobile_slider_images' as any) as any).update({ display_order: swapOrder }).eq('id', mobileSlides[idx].id);
      await (supabase.from('mobile_slider_images' as any) as any).update({ display_order: currentOrder }).eq('id', mobileSlides[swapIdx].id);
    },
    onSuccess: () => invalidateSliders(),
  });

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, type: 'desktop' | 'mobile' = 'desktop') => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { toast.error('File must be under 5MB'); return; }
    try {
      const url = await uploadImage(file);
      if (type === 'mobile') {
        addMobileSlideMutation.mutate(url);
      } else {
        addSlideMutation.mutate(url);
      }
    } catch { toast.error('Upload failed'); }
  };

  const handleUrlAdd = (type: 'desktop' | 'mobile' = 'desktop') => {
    if (type === 'mobile') {
      if (!newMobileSlide.image_url) { toast.error('Please enter an image URL'); return; }
      addMobileSlideMutation.mutate(newMobileSlide.image_url);
    } else {
      if (!newSlide.image_url) { toast.error('Please enter an image URL'); return; }
      addSlideMutation.mutate(newSlide.image_url);
    }
  };

  const renderSlideForm = (type: 'desktop' | 'mobile') => {
    const slide = type === 'desktop' ? newSlide : newMobileSlide;
    const setSlide = type === 'desktop' ? setNewSlide : setNewMobileSlide;
    const isPending = type === 'desktop' ? addSlideMutation.isPending : addMobileSlideMutation.isPending;

    return (
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5" /> Add New {type === 'mobile' ? 'Mobile' : 'Desktop'} Slide
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Title (optional)</Label>
              <Input value={slide.title} onChange={e => setSlide({ ...slide, title: e.target.value })} placeholder="Slide title" />
            </div>
            <div className="space-y-2">
              <Label>Subtitle (optional)</Label>
              <Input value={slide.subtitle} onChange={e => setSlide({ ...slide, subtitle: e.target.value })} placeholder="Slide subtitle" />
            </div>
            <div className="space-y-2">
              <Label>Button Text</Label>
              <Input value={slide.cta_text} onChange={e => setSlide({ ...slide, cta_text: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Button Link</Label>
              <Input value={slide.cta_link} onChange={e => setSlide({ ...slide, cta_link: e.target.value })} />
            </div>
          </div>
          <div className="flex gap-4 items-end">
            <div className="flex-1 space-y-2">
              <Label>Image URL</Label>
              <Input value={slide.image_url} onChange={e => setSlide({ ...slide, image_url: e.target.value })} placeholder="https://..." />
            </div>
            <Button onClick={() => handleUrlAdd(type)} disabled={isPending}>
              <Plus className="h-4 w-4 mr-2" /> Add via URL
            </Button>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground">— or —</span>
            <label className="cursor-pointer">
              <input type="file" accept="image/*" className="hidden" onChange={(e) => handleFileUpload(e, type)} />
              <Button asChild variant="outline" disabled={uploading}>
                <span>
                  {uploading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
                  Upload Image
                </span>
              </Button>
            </label>
          </div>
          {type === 'mobile' && (
            <p className="text-xs text-muted-foreground">💡 Tip: Use square (1:1) images for best mobile display.</p>
          )}
        </CardContent>
      </Card>
    );
  };

  return (
    <AdminLayout>
      <div className="p-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold">Slider Management</h1>
          <p className="text-muted-foreground">Manage homepage slider images for desktop and mobile</p>
        </div>

        <Tabs defaultValue="desktop" className="w-full">
          <TabsList className="mb-6">
            <TabsTrigger value="desktop" className="gap-2"><Monitor className="h-4 w-4" /> Desktop Slider</TabsTrigger>
            <TabsTrigger value="mobile" className="gap-2"><Smartphone className="h-4 w-4" /> Mobile Slider</TabsTrigger>
          </TabsList>

          {/* Desktop Tab */}
          <TabsContent value="desktop">
            {renderSlideForm('desktop')}
            <Card>
              <CardHeader>
                <CardTitle>Desktop Slides ({slides?.length || 0})</CardTitle>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="text-center py-8"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></div>
                ) : slides?.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Image className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No slider images yet. Add one above.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {slides?.map((slide, index) => (
                      <div key={slide.id} className="flex items-center gap-4 p-4 border border-border rounded-xl bg-card">
                        <img src={slide.image_url} alt={slide.title || 'Desktop'} className="w-24 h-14 object-cover rounded-lg shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm truncate">{slide.title || '(No title)'}</p>
                          <p className="text-xs text-muted-foreground truncate">{slide.subtitle || '(No subtitle)'}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Switch checked={slide.is_active} onCheckedChange={(checked) => toggleActiveMutation.mutate({ id: slide.id, is_active: checked })} />
                          <Button variant="ghost" size="icon" disabled={index === 0} onClick={() => reorderMutation.mutate({ id: slide.id, direction: 'up' })}><ArrowUp className="h-4 w-4" /></Button>
                          <Button variant="ghost" size="icon" disabled={index === (slides?.length || 0) - 1} onClick={() => reorderMutation.mutate({ id: slide.id, direction: 'down' })}><ArrowDown className="h-4 w-4" /></Button>
                          <Button variant="ghost" size="icon" className="text-destructive" onClick={() => deleteSlideMutation.mutate(slide.id)}><Trash2 className="h-4 w-4" /></Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Mobile Tab */}
          <TabsContent value="mobile">
            {renderSlideForm('mobile')}
            <Card>
              <CardHeader>
                <CardTitle>Mobile Slides ({mobileSlides?.length || 0})</CardTitle>
              </CardHeader>
              <CardContent>
                {mobileLoading ? (
                  <div className="text-center py-8"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></div>
                ) : !mobileSlides || mobileSlides.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Smartphone className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No mobile slider images yet. Add one above.</p>
                    <p className="text-xs mt-1">Mobile slides show as square banners on phones.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {mobileSlides.map((slide, index) => (
                      <div key={slide.id} className="flex items-center gap-4 p-4 border border-border rounded-xl bg-card">
                        <img src={slide.image_url} alt={slide.title || 'Mobile'} className="w-14 h-14 object-cover rounded-lg shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm truncate">{slide.title || '(No title)'}</p>
                          <p className="text-xs text-muted-foreground truncate">{slide.subtitle || '(No subtitle)'}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Switch checked={slide.is_active} onCheckedChange={(checked) => toggleMobileActiveMutation.mutate({ id: slide.id, is_active: checked })} />
                          <Button variant="ghost" size="icon" disabled={index === 0} onClick={() => reorderMobileMutation.mutate({ id: slide.id, direction: 'up' })}><ArrowUp className="h-4 w-4" /></Button>
                          <Button variant="ghost" size="icon" disabled={index === (mobileSlides?.length || 0) - 1} onClick={() => reorderMobileMutation.mutate({ id: slide.id, direction: 'down' })}><ArrowDown className="h-4 w-4" /></Button>
                          <Button variant="ghost" size="icon" className="text-destructive" onClick={() => deleteMobileSlideMutation.mutate(slide.id)}><Trash2 className="h-4 w-4" /></Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AdminLayout>
  );
};

export default AdminSlider;
