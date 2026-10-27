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
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow 
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, FolderTree, ChevronRight } from 'lucide-react';
import { format } from 'date-fns';

const AdminCategories = () => {
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<any>(null);
  const [formData, setFormData] = useState({
    name: '',
    slug: '',
    description: '',
    image_url: '',
    is_active: true,
    parent_id: null as string | null,
  });

  const { data: categories, isLoading } = useQuery({
    queryKey: ['categories'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('categories')
        .select('*')
        .order('name');
      if (error) throw error;
      return data;
    },
  });

  // Separate main categories and subcategories
  const mainCategories = categories?.filter(c => !c.parent_id) || [];
  const getSubcategories = (parentId: string) => 
    categories?.filter(c => c.parent_id === parentId) || [];

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const { error } = await supabase.from('categories').insert(data);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      toast.success('Category created successfully');
      resetForm();
    },
    onError: (error) => {
      toast.error('Failed to create category');
      console.error(error);
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const { error } = await supabase.from('categories').update(data).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      toast.success('Category updated successfully');
      resetForm();
    },
    onError: (error) => {
      toast.error('Failed to update category');
      console.error(error);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('categories').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      toast.success('Category deleted successfully');
    },
    onError: (error) => {
      toast.error('Failed to delete category. It may have products or subcategories associated.');
      console.error(error);
    },
  });

  const resetForm = () => {
    setFormData({ name: '', slug: '', description: '', image_url: '', is_active: true, parent_id: null });
    setEditingCategory(null);
    setIsDialogOpen(false);
  };

  const handleEdit = (category: any) => {
    setEditingCategory(category);
    setFormData({
      name: category.name,
      slug: category.slug,
      description: category.description || '',
      image_url: category.image_url || '',
      is_active: category.is_active,
      parent_id: category.parent_id || null,
    });
    setIsDialogOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const slug = formData.slug || formData.name.toLowerCase().replace(/\s+/g, '-');
    const dataToSubmit = { ...formData, slug, parent_id: formData.parent_id || null };

    if (editingCategory) {
      updateMutation.mutate({ id: editingCategory.id, data: dataToSubmit });
    } else {
      createMutation.mutate(dataToSubmit);
    }
  };

  const CategoryRow = ({ category, level = 0 }: { category: any; level?: number }) => {
    const subs = getSubcategories(category.id);
    return (
      <>
        <TableRow key={category.id}>
          <TableCell className="font-medium">
            <div className="flex items-center gap-2" style={{ paddingLeft: `${level * 24}px` }}>
              {level > 0 && <ChevronRight className="w-3 h-3 text-muted-foreground" />}
              {category.image_url && (
                <img src={category.image_url} alt={category.name} className="w-8 h-8 object-cover rounded" />
              )}
              <span>{category.name}</span>
              {level === 0 && subs.length > 0 && (
                <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">
                  {subs.length} sub
                </span>
              )}
            </div>
          </TableCell>
          <TableCell className="text-muted-foreground">{category.slug}</TableCell>
          <TableCell className="max-w-xs truncate">{category.description || '-'}</TableCell>
          <TableCell>
            <span className={`px-2 py-1 rounded-full text-xs ${
              category.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'
            }`}>
              {category.is_active ? 'Active' : 'Inactive'}
            </span>
          </TableCell>
          <TableCell>{format(new Date(category.created_at), 'MMM dd, yyyy')}</TableCell>
          <TableCell>
            <div className="flex gap-2">
              <Button variant="ghost" size="icon" onClick={() => handleEdit(category)}>
                <Pencil className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost" size="icon" className="text-destructive"
                onClick={() => {
                  if (confirm('Are you sure you want to delete this category?')) {
                    deleteMutation.mutate(category.id);
                  }
                }}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </TableCell>
        </TableRow>
        {subs.map(sub => <CategoryRow key={sub.id} category={sub} level={level + 1} />)}
      </>
    );
  };

  return (
    <AdminLayout>
      <div className="p-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold">Category Management</h1>
            <p className="text-muted-foreground">Manage rental product categories & subcategories</p>
          </div>
          
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={() => resetForm()}>
                <Plus className="h-4 w-4 mr-2" />
                Add Category
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editingCategory ? 'Edit Category' : 'Add Category'}</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="parent_id">Parent Category (optional)</Label>
                  <Select
                    value={formData.parent_id || 'none'}
                    onValueChange={(val) => setFormData({ ...formData, parent_id: val === 'none' ? null : val })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="None (Main Category)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None (Main Category)</SelectItem>
                      {mainCategories
                        .filter(c => c.id !== editingCategory?.id)
                        .map(c => (
                          <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="name">Name</Label>
                  <Input
                    id="name" value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="e.g., Washing Machines" required
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="slug">Slug</Label>
                  <Input
                    id="slug" value={formData.slug}
                    onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
                    placeholder="e.g., washing-machines (auto-generated if empty)"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description" value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Category description..."
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="image_url">Image URL</Label>
                  <Input
                    id="image_url" value={formData.image_url}
                    onChange={(e) => setFormData({ ...formData, image_url: e.target.value })}
                    placeholder="https://..."
                  />
                </div>
                
                <div className="flex items-center justify-between">
                  <Label htmlFor="is_active">Active</Label>
                  <Switch
                    id="is_active" checked={formData.is_active}
                    onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
                  />
                </div>

                <DialogFooter>
                  <Button type="button" variant="outline" onClick={resetForm}>Cancel</Button>
                  <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
                    {createMutation.isPending || updateMutation.isPending ? 'Saving...' : editingCategory ? 'Update' : 'Create'}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Categories ({categories?.length || 0})</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-8">Loading categories...</div>
            ) : categories?.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <FolderTree className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No categories yet</p>
                <p className="text-sm">Create your first category to get started</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Slug</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {mainCategories.map(cat => (
                    <CategoryRow key={cat.id} category={cat} />
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
};

export default AdminCategories;
