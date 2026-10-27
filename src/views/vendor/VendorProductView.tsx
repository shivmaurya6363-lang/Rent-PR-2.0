"use client";

import { useParams, useNavigate, Link } from '@/lib/router';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import VendorLayout from '@/components/vendor/VendorLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Pencil, Loader2, Star, Check, MapPin } from 'lucide-react';

type ProductStatus = 'pending' | 'approved' | 'rejected' | 'inactive';

const VendorProductView = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data: product, isLoading, error } = useQuery({
    queryKey: ['vendor-product-view', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products')
        .select(`
          *,
          categories (name),
          rental_plans (*)
        `)
        .eq('id', id)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const { data: productLocations } = useQuery({
    queryKey: ['vendor-product-locations', id],
    enabled: !!id,
    queryFn: async () => {
      const { data } = await supabase
        .from('product_locations')
        .select('location_id, locations (name)')
        .eq('product_id', id!);
      return data || [];
    },
  });

  const getStatusBadge = (status: ProductStatus) => {
    const variants: Record<ProductStatus, 'default' | 'secondary' | 'destructive' | 'outline'> = {
      pending: 'secondary',
      approved: 'default',
      rejected: 'destructive',
      inactive: 'outline',
    };
    return <Badge variant={variants[status]}>{status}</Badge>;
  };

  if (isLoading) {
    return (
      <VendorLayout>
        <div className="p-8 flex items-center justify-center min-h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </VendorLayout>
    );
  }

  if (error || !product) {
    return (
      <VendorLayout>
        <div className="p-8">
          <div className="text-center py-12">
            <h2 className="text-2xl font-bold mb-4">Product Not Found</h2>
            <p className="text-muted-foreground mb-6">The product you're looking for doesn't exist or you don't have access to it.</p>
            <Button onClick={() => navigate('/vendor/products')}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Products
            </Button>
          </div>
        </div>
      </VendorLayout>
    );
  }

  return (
    <VendorLayout>
      <div className="p-8 max-w-4xl">
        <div className="flex items-center justify-between mb-6">
          <Button variant="ghost" onClick={() => navigate('/vendor/products')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Products
          </Button>
          <Button asChild>
            <Link to={`/vendor/products/${id}/edit`}>
              <Pencil className="h-4 w-4 mr-2" />
              Edit Product
            </Link>
          </Button>
        </div>

        {/* Status Banner */}
        {product.status === 'rejected' && product.rejection_reason && (
          <Card className="mb-6 border-destructive">
            <CardContent className="pt-6">
              <div className="flex items-start gap-3">
                <div className="flex-1">
                  <p className="font-medium text-destructive">Product Rejected</p>
                  <p className="text-sm text-muted-foreground mt-1">{product.rejection_reason}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Product Header */}
        <div className="flex items-start gap-6 mb-8">
          {product.images?.[0] && (
            <img
              src={product.images[0]}
              alt={product.name}
              className="w-32 h-32 object-cover rounded-lg"
            />
          )}
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2">
              {getStatusBadge(product.status)}
              {product.tags?.map((tag: string) => (
                <Badge key={tag} variant="outline">{tag}</Badge>
              ))}
            </div>
            <h1 className="text-3xl font-bold">{product.name}</h1>
            <p className="text-muted-foreground">{product.brand}</p>
            {product.categories?.name && (
              <p className="text-sm text-muted-foreground mt-1">Category: {product.categories.name}</p>
            )}
            {productLocations && productLocations.length > 0 && (
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                <MapPin className="h-4 w-4 text-muted-foreground" />
                {productLocations.map((pl: any) => (
                  <Badge key={pl.location_id} variant="outline">{pl.locations?.name}</Badge>
                ))}
              </div>
            )}
            <div className="flex items-center gap-4 mt-3">
              <div className="flex items-center gap-1">
                <Star className="w-4 h-4 fill-yellow-400 text-yellow-400" />
                <span className="text-sm">{product.rating || 0}</span>
                <span className="text-sm text-muted-foreground">({product.review_count || 0} reviews)</span>
              </div>
              <span className={`text-sm ${product.in_stock ? 'text-green-600' : 'text-red-600'}`}>
                {product.in_stock ? `${product.stock_quantity} in stock` : 'Out of stock'}
              </span>
            </div>
          </div>
        </div>

        {/* Description */}
        {product.description && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>Description</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground whitespace-pre-wrap">{product.description}</p>
            </CardContent>
          </Card>
        )}

        {/* Features */}
        {product.features?.length > 0 && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>Features</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {product.features.map((feature: string, index: number) => (
                  <li key={index} className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-green-600" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

        {/* Specifications */}
        {product.specifications && Object.keys(product.specifications).length > 0 && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>Specifications</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                {Object.entries(product.specifications as Record<string, string>).map(([key, value]) => (
                  <div key={key} className="flex justify-between p-2 bg-muted rounded">
                    <span className="text-muted-foreground">{key}</span>
                    <span className="font-medium">{value}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Rental Plans */}
        {product.rental_plans?.filter((p: any) => p.is_active !== false).length > 0 && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>Rental Plans</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4">
                {product.rental_plans.filter((plan: any) => plan.is_active !== false).map((plan: any) => (
                  <div key={plan.id} className="p-4 border rounded-lg">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="font-medium">{plan.label}</h4>
                      <span className="text-sm text-muted-foreground">{plan.duration_months} months</span>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                      <div>
                        <p className="text-muted-foreground">Monthly Rent</p>
                        <p className="font-medium">₹{plan.monthly_rent?.toLocaleString()}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Security Deposit</p>
                        <p className="font-medium">₹{plan.security_deposit?.toLocaleString()}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Delivery Fee</p>
                        <p className="font-medium">₹{plan.delivery_fee?.toLocaleString() || 0}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Installation Fee</p>
                        <p className="font-medium">₹{plan.installation_fee?.toLocaleString() || 0}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Images */}
        {product.images?.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Product Images</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {product.images.map((image: string, index: number) => (
                  <img
                    key={index}
                    src={image}
                    alt={`${product.name} ${index + 1}`}
                    className="w-full aspect-square object-cover rounded-lg"
                  />
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </VendorLayout>
  );
};

export default VendorProductView;