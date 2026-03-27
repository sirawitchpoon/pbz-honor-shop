import mongoose from 'mongoose';

export type ProductCategory = 'role' | 'steam_gift_card' | 'discord_nitro';

export interface IProduct {
  productId: string;
  name: string;
  description: string;
  category: ProductCategory;
  price: number;
  stock: number;
  roleId?: string;
  deliveryContent?: string;
  imageUrl?: string;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const ProductSchema = new mongoose.Schema<IProduct>(
  {
    productId: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true },
    description: { type: String, default: '' },
    category: {
      type: String,
      required: true,
      enum: ['role', 'steam_gift_card', 'discord_nitro'],
      index: true,
    },
    price: { type: Number, required: true, min: 1 },
    stock: { type: Number, default: -1 },
    roleId: { type: String },
    deliveryContent: { type: String },
    imageUrl: { type: String },
    active: { type: Boolean, default: true, index: true },
  },
  { timestamps: true, collection: 'shop_products' }
);

export const Product =
  mongoose.models.Product || mongoose.model<IProduct>('Product', ProductSchema);
