"use client";

import { useState } from "react";
import { Link, useSearchParams } from "@/lib/router";
import { ArrowLeft, User, MapPin, ShoppingBag, FileText, LayoutDashboard } from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import AccountDashboard from "@/components/account/AccountDashboard";
import AccountInfo from "@/components/account/AccountInfo";
import AddressBook from "@/components/account/AddressBook";
import AccountOrders from "@/components/account/AccountOrders";
import AccountDocuments from "@/components/account/AccountDocuments";

const tabs = [
  { id: "dashboard", label: "Account Dashboard", icon: LayoutDashboard },
  { id: "info", label: "Account Information", icon: User },
  { id: "addresses", label: "Address Book", icon: MapPin },
  { id: "orders", label: "My Orders", icon: ShoppingBag },
  { id: "documents", label: "Document Upload", icon: FileText },
];

const MyAccount = () => {
  const { user, isLoading: authLoading } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get("tab") || "dashboard";

  const setActiveTab = (tab: string) => {
    setSearchParams({ tab });
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <Header />
        <main className="flex-1 flex items-center justify-center py-16">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </main>
        <Footer />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <Header />
        <main className="flex-1 flex items-center justify-center py-16">
          <div className="text-center space-y-6">
            <User className="w-16 h-16 mx-auto text-muted-foreground" />
            <h1 className="text-2xl font-bold text-foreground">Please sign in</h1>
            <p className="text-muted-foreground">Sign in to access your account</p>
            <Link to="/auth?redirect=/my-account">
              <Button variant="hero">Sign In</Button>
            </Link>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      <main className="flex-1 py-8">
        <div className="container mx-auto px-4">
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Home
          </Link>

          <div className="flex flex-col lg:flex-row gap-8">
            {/* Sidebar */}
            <aside className="lg:w-64 shrink-0">
              <nav className="space-y-1">
                {tabs.map((tab) => {
                  const Icon = tab.icon;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={`w-full flex items-center gap-3 px-4 py-3 text-sm font-medium rounded-lg transition-colors text-left ${
                        activeTab === tab.id
                          ? "bg-primary text-primary-foreground"
                          : "text-foreground/70 hover:bg-muted hover:text-foreground"
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                      {tab.label}
                    </button>
                  );
                })}
              </nav>
            </aside>

            {/* Content */}
            <div className="flex-1 min-w-0">
              {activeTab === "dashboard" && <AccountDashboard onNavigate={setActiveTab} />}
              {activeTab === "info" && <AccountInfo />}
              {activeTab === "addresses" && <AddressBook />}
              {activeTab === "orders" && <AccountOrders />}
              {activeTab === "documents" && <AccountDocuments />}
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default MyAccount;
