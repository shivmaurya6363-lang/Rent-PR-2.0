"use client";

import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Loader2 } from "lucide-react";

interface Address {
  id: string;
  full_name: string;
  phone: string;
  address_line1: string;
  address_line2: string | null;
  city: string;
  state: string;
  pincode: string;
  label: string | null;
  is_default: boolean | null;
}

const emptyAddress = {
  full_name: "", phone: "", address_line1: "", address_line2: "",
  city: "", state: "", pincode: "", label: "Home",
};

const AddressBook = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [editAddress, setEditAddress] = useState<Address | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [form, setForm] = useState(emptyAddress);
  const [isSaving, setIsSaving] = useState(false);

  const { data: addresses, isLoading } = useQuery({
    queryKey: ["my-addresses", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("addresses")
        .select("*")
        .eq("user_id", user!.id)
        .order("is_default", { ascending: false });
      return (data || []) as Address[];
    },
  });

  const openNew = () => {
    setForm(emptyAddress);
    setEditAddress(null);
    setIsNew(true);
  };

  const openEdit = (addr: Address) => {
    setForm({
      full_name: addr.full_name,
      phone: addr.phone,
      address_line1: addr.address_line1,
      address_line2: addr.address_line2 || "",
      city: addr.city,
      state: addr.state,
      pincode: addr.pincode,
      label: addr.label || "Home",
    });
    setEditAddress(addr);
    setIsNew(false);
  };

  const closeDialog = () => {
    setEditAddress(null);
    setIsNew(false);
    setForm(emptyAddress);
  };

  const handleSave = async () => {
    if (!user || !form.full_name || !form.phone || !form.address_line1 || !form.city || !form.state || !form.pincode) {
      toast.error("Please fill all required fields");
      return;
    }
    setIsSaving(true);
    try {
      const payload = {
        user_id: user.id,
        full_name: form.full_name,
        phone: form.phone,
        address_line1: form.address_line1,
        address_line2: form.address_line2 || null,
        city: form.city,
        state: form.state,
        pincode: form.pincode,
        label: form.label || "Home",
      };

      if (editAddress) {
        const { error } = await supabase.from("addresses").update(payload).eq("id", editAddress.id);
        if (error) throw error;
      } else {
        const isFirst = !addresses || addresses.length === 0;
        const { error } = await supabase.from("addresses").insert({ ...payload, is_default: isFirst });
        if (error) throw error;
      }
      toast.success(editAddress ? "Address updated" : "Address added");
      queryClient.invalidateQueries({ queryKey: ["my-addresses"] });
      closeDialog();
    } catch (e: any) {
      toast.error(e.message || "Failed to save address");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const { error } = await supabase.from("addresses").delete().eq("id", id);
      if (error) throw error;
      toast.success("Address deleted");
      queryClient.invalidateQueries({ queryKey: ["my-addresses"] });
    } catch (e: any) {
      toast.error("Failed to delete address");
    }
  };

  const handleSetDefault = async (id: string) => {
    if (!user) return;
    try {
      // Remove default from all
      await supabase.from("addresses").update({ is_default: false }).eq("user_id", user.id);
      // Set new default
      await supabase.from("addresses").update({ is_default: true }).eq("id", id);
      toast.success("Default address updated");
      queryClient.invalidateQueries({ queryKey: ["my-addresses"] });
    } catch {
      toast.error("Failed to update default address");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Address Book</h1>
        <Button onClick={openNew} size="sm" className="gap-2">
          <Plus className="w-4 h-4" /> Add Address
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
      ) : addresses && addresses.length > 0 ? (
        <div className="grid md:grid-cols-2 gap-4">
          {addresses.map((addr) => (
            <Card key={addr.id}>
              <CardHeader className="pb-2 flex flex-row items-center justify-between">
                <div className="flex items-center gap-2">
                  <CardTitle className="text-base">{addr.label || "Address"}</CardTitle>
                  {addr.is_default && <Badge variant="secondary">Default</Badge>}
                </div>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(addr)}>
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDelete(addr.id)}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="text-sm space-y-1">
                <p className="font-medium">{addr.full_name}</p>
                <p className="text-muted-foreground">{addr.address_line1}</p>
                {addr.address_line2 && <p className="text-muted-foreground">{addr.address_line2}</p>}
                <p className="text-muted-foreground">{addr.city}, {addr.state}, {addr.pincode}</p>
                <p className="text-muted-foreground">T: {addr.phone}</p>
                {!addr.is_default && (
                  <Button variant="link" size="sm" className="px-0 h-auto text-primary" onClick={() => handleSetDefault(addr.id)}>
                    Set as Default
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            No addresses saved yet. Add one to get started.
          </CardContent>
        </Card>
      )}

      {/* Add/Edit Dialog */}
      <Dialog open={isNew || !!editAddress} onOpenChange={closeDialog}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editAddress ? "Edit Address" : "Add New Address"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Full Name *</Label>
                <Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Phone *</Label>
                <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Address Line 1 *</Label>
              <Input value={form.address_line1} onChange={(e) => setForm({ ...form, address_line1: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Address Line 2</Label>
              <Input value={form.address_line2} onChange={(e) => setForm({ ...form, address_line2: e.target.value })} />
            </div>
            <div className="grid sm:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>City *</Label>
                <Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>State *</Label>
                <Input value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Pincode *</Label>
                <Input value={form.pincode} onChange={(e) => setForm({ ...form, pincode: e.target.value })} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Label</Label>
              <Input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="e.g. Home, Office" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>Cancel</Button>
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {editAddress ? "Update" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AddressBook;
