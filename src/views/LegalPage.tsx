"use client";

import { useParams } from "@/lib/router";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { supabase } from "@/integrations/supabase/client";

const LegalPage = () => {
  const { slug } = useParams<{ slug: string }>();

  const { data: doc, isLoading } = useQuery({
    queryKey: ["legal-document", slug],
    enabled: !!slug,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("legal_documents")
        .select("title, content, updated_at")
        .eq("slug", slug!)
        .eq("is_active", true)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const renderContent = (content: string) => {
    return content.split("\n").map((line, i) => {
      if (line.startsWith("# ")) return <h1 key={i} className="text-2xl font-bold mt-6 mb-3 text-foreground">{line.slice(2)}</h1>;
      if (line.startsWith("## ")) return <h2 key={i} className="text-xl font-semibold mt-5 mb-2 text-foreground">{line.slice(3)}</h2>;
      if (line.trim() === "") return <br key={i} />;
      return <p key={i} className="text-base text-muted-foreground leading-relaxed">{line}</p>;
    });
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      <main className="flex-1 py-12">
        <div className="container mx-auto px-4 max-w-3xl">
          {isLoading ? (
            <div className="flex justify-center py-20">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : doc ? (
            <article className="prose prose-sm max-w-none">
              {renderContent(doc.content)}
            </article>
          ) : (
            <div className="text-center py-20">
              <h1 className="text-2xl font-bold text-foreground mb-2">Page Not Found</h1>
              <p className="text-muted-foreground">The requested document could not be found.</p>
            </div>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default LegalPage;
