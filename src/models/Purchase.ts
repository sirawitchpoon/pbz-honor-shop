import mongoose from 'mongoose';

export type PurchaseStatus = 'completed' | 'pending' | 'failed' | 'refunded';

export interface IPurchase {
  purchaseId: string;
  userId: string;
  username: string;
  productId: string;
  productName: string;
  category: string;
  price: number;
  status: PurchaseStatus;
  deliveredContent?: string;
  createdAt: Date;
  updatedAt: Date;
}

const PurchaseSchema = new mongoose.Schema<IPurchase>(
  {
    purchaseId: { type: String, required: true, unique: true, index: true },
    userId: { type: String, required: true, index: true },
    username: { type: String, required: true },
    productId: { type: String, required: true, index: true },
    productName: { type: String, required: true },
    category: { type: String, required: true },
    price: { type: Number, required: true },
    status: {
      type: String,
      required: true,
      enum: ['completed', 'pending', 'failed', 'refunded'],
      default: 'pending',
      index: true,
    },
    deliveredContent: { type: String },
  },
  { timestamps: true, collection: 'shop_purchases' }
);

export const Purchase =
  mongoose.models.Purchase || mongoose.model<IPurchase>('Purchase', PurchaseSchema);
