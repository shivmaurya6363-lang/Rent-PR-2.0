"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Loader2, Save, FileText, Eye, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import AdminLayout from "@/components/admin/AdminLayout";
import { supabase } from "@/integrations/supabase/client";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useQuery, useQueryClient } from "@tanstack/react-query";

interface LegalDoc {
  id: string;
  slug: string;
  title: string;
  content: string;
  version: number;
  is_active: boolean;
}

const AdminLegal = () => {
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState<string | null>(null);
  const [editedDocs, setEditedDocs] = useState<Record<string, { title: string; content: string }>>({});
  const [previewSlug, setPreviewSlug] = useState<string | null>(null);
  const [newDocOpen, setNewDocOpen] = useState(false);
  const [newDoc, setNewDoc] = useState({ title: '', slug: '' });

  const { data: docs = [], isLoading: loading } = useQuery({
    queryKey: ['admin-legal-documents'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("legal_documents")
        .select("*")
        .order("created_at");
      if (error) throw error;
      return (data || []) as LegalDoc[];
    },
  });

  const handleChange = (slug: string, field: "title" | "content", value: string) => {
    const doc = docs.find(d => d.slug === slug);
    if (!doc) return;
    setEditedDocs(prev => ({
      ...prev,
      [slug]: {
        title: field === "title" ? value : (prev[slug]?.title ?? doc.title),
        content: field === "content" ? value : (prev[slug]?.content ?? doc.content),
      }
    }));
  };

  const handleSave = async (doc: LegalDoc) => {
    const edited = editedDocs[doc.slug];
    if (!edited) return;

    setSaving(doc.slug);
    const { error } = await supabase
      .from("legal_documents")
      .update({
        title: edited.title,
        content: edited.content,
        version: doc.version + 1,
        updated_at: new Date().toISOString(),
      })
      .eq("id", doc.id);

    if (error) {
      toast.error("Failed to save");
    } else {
      toast.success(`${edited.title} saved (v${doc.version + 1})`);
      setEditedDocs(prev => {
        const next = { ...prev };
        delete next[doc.slug];
        return next;
      });
      queryClient.invalidateQueries({ queryKey: ['admin-legal-documents'] });
    }
    setSaving(null);
  };

  const handleCreateDoc = async () => {
    if (!newDoc.title.trim() || !newDoc.slug.trim()) {
      toast.error("Title and slug are required");
      return;
    }
    const slug = newDoc.slug.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-');
    const { error } = await supabase.from("legal_documents").insert({
      title: newDoc.title,
      slug,
      content: `# ${newDoc.title}\n\nAdd your content here.`,
    });
    if (error) {
      toast.error(error.message.includes('duplicate') ? "A document with this slug already exists" : "Failed to create document");
      return;
    }
    toast.success(`"${newDoc.title}" created`);
    setNewDoc({ title: '', slug: '' });
    setNewDocOpen(false);
    queryClient.invalidateQueries({ queryKey: ['admin-legal-documents'] });
  };

  const handleDelete = async (doc: LegalDoc) => {
    if (!confirm(`Delete "${doc.title}"? This cannot be undone.`)) return;
    const { error } = await supabase.from("legal_documents").delete().eq("id", doc.id);
    if (error) {
      toast.error("Failed to delete");
      return;
    }
    toast.success(`"${doc.title}" deleted`);
    queryClient.invalidateQueries({ queryKey: ['admin-legal-documents'] });
  };

  const renderPreview = (content: string) => {
    return content.split("\n").map((line, i) => {
      if (line.startsWith("# ")) return <h2 key={i} className="text-lg font-bold mt-4 mb-2">{line.slice(2)}</h2>;
      if (line.startsWith("## ")) return <h3 key={i} className="text-base font-semibold mt-3 mb-1">{line.slice(3)}</h3>;
      if (line.trim() === "") return <br key={i} />;
      return <p key={i} className="text-sm text-muted-foreground">{line}</p>;
    });
  };

  if (loading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Legal Documents</h1>
            <p className="text-muted-foreground text-sm">
              Manage legal pages. Documents linked from Footer → Policy Links are auto-created.
            </p>
          </div>
          <Dialog open={newDocOpen} onOpenChange={setNewDocOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="w-4 h-4 mr-2" /> New Document</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Create Legal Document</DialogTitle></DialogHeader>
              <div className="space-y-4 pt-2">
                <div className="space-y-2">
                  <Label>Title</Label>
                  <Input
                    value={newDoc.title}
                    onChange={e => {
                      const title = e.target.value;
                      setNewDoc({ title, slug: title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+$/, '') });
                    }}
                    placeholder="e.g. Refund Policy"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Slug</Label>
                  <Input
                    value={newDoc.slug}
                    onChange={e => setNewDoc({ ...newDoc, slug: e.target.value })}
                    placeholder="e.g. refund-policy"
                  />
                  <p className="text-xs text-muted-foreground">URL: /legal/{newDoc.slug || 'your-slug'}</p>
                </div>
                <Button onClick={handleCreateDoc} className="w-full">Create Document</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {docs.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <FileText className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">No legal documents yet. Create one or add policy links in Footer Settings.</p>
            </CardContent>
          </Card>
        ) : (
          <Tabs defaultValue={docs[0]?.slug}>
            <TabsList className="flex-wrap h-auto gap-1">
              {docs.map(doc => (
                <TabsTrigger key={doc.slug} value={doc.slug} className="text-xs">
                  {doc.title}
                </TabsTrigger>
              ))}
            </TabsList>

            {docs.map(doc => {
              const edited = editedDocs[doc.slug];
              const currentTitle = edited?.title ?? doc.title;
              const currentContent = edited?.content ?? doc.content;
              const hasChanges = !!edited;

              return (
                <TabsContent key={doc.slug} value={doc.slug}>
                  <Card>
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <CardTitle className="flex items-center gap-2 text-lg">
                          <FileText className="w-5 h-5" />
                          {doc.title}
                          <span className="text-xs text-muted-foreground font-normal">v{doc.version}</span>
                        </CardTitle>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setPreviewSlug(previewSlug === doc.slug ? null : doc.slug)}
                          >
                            <Eye className="w-4 h-4 mr-1" />
                            Preview
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleDelete(doc)}
                            className="text-destructive hover:text-destructive"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                          <Button
                            size="sm"
                            disabled={!hasChanges || saving === doc.slug}
                            onClick={() => handleSave(doc)}
                          >
                            {saving === doc.slug ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Save className="w-4 h-4 mr-1" />}
                            Save
                          </Button>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="space-y-2">
                        <Label>Title</Label>
                        <Input
                          value={currentTitle}
                          onChange={e => handleChange(doc.slug, "title", e.target.value)}
                        />
                      </div>

                      {previewSlug === doc.slug ? (
                        <div className="space-y-2">
                          <Label>Preview</Label>
                          <ScrollArea className="h-[400px] border rounded-lg p-4 bg-muted/30">
                            {renderPreview(currentContent)}
                          </ScrollArea>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <Label>Content (Markdown-style)</Label>
                          <Textarea
                            value={currentContent}
                            onChange={e => handleChange(doc.slug, "content", e.target.value)}
                            rows={18}
                            className="font-mono text-sm"
                            placeholder="# Heading&#10;## Subheading&#10;Paragraph text..."
                          />
                        </div>
                      )}

                      <p className="text-xs text-muted-foreground">
                        Slug: <code className="bg-muted px-1 rounded">/legal/{doc.slug}</code> • 
                        Use # for headings and ## for subheadings
                      </p>
                    </CardContent>
                  </Card>
                </TabsContent>
              );
            })}
          </Tabs>
        )}
      </div>
    </AdminLayout>
  );
};

export default AdminLegal;
