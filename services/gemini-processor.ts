import { GoogleGenerativeAI, GenerativeModel, SchemaType } from "@google/generative-ai";
import { promises as fs } from 'fs';
import * as dotenv from 'dotenv';
dotenv.config();

// Types for JSON Response
interface ReceiptItem {
  name: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
}

interface ReceiptData {
  metadata: {
    storeName: string;
    storeAddress?: string;
    date: string;
    time?: string;
    receiptNumber?: string;
  };
  items: ReceiptItem[];
  summary: {
    subtotal: number;
    tax?: number;
    tip?: number;
    total: number;
    paymentMethod?: string;
  };
  additionalNotes?: string[];
}

interface GeminiConfig {
  apiKey: string;
  modelName: string;
}

interface ImageProcessingOptions {
  mimeType: string;
  prompt?: string;
}

export interface GeminiResponse {
  error?: string;
  text: string;
  parsedData?: {
    metadata: {
      storeName: string;
      storeAddress?: string;
      date: string;
      time?: string;
      receiptNumber?: string;
    };
    items: Array<{
      name: string;
      quantity: string;
      unitPrice: string;
      totalPrice: string;
    }>;
    summary: {
      subtotal: string;
      tax?: string;
      tip?: string;
      total: string;
      paymentMethod?: string;
      serviceCharge?: string;
      serviceTax?: string;
    };
    additionalNotes?: string[];
  } | null;
}

export class GeminiImageProcessor {
  private model: GenerativeModel;
  private static readonly DEFAULT_MODEL = "gemini-1.5-flash";
  
  private static readonly RESPONSE_SCHEMA = {
    description: "Receipt data",
    type: SchemaType.OBJECT,
    properties: {
      metadata: {
        description: "Metadata about the store and receipt",
        type: SchemaType.OBJECT,
        properties: {
          storeName: { type: SchemaType.STRING },
          storeAddress: { type: SchemaType.STRING },
          date: {
            type: SchemaType.STRING,
            description: "Date in YYYY-MM-DD format"
          },
          time: {
            type: SchemaType.STRING,
            description: "Time in HH:MM format"
          },
          receiptNumber: { type: SchemaType.STRING }
        },
        required: ["storeName", "date"]
      },
      items: {
        description: "List of items in the receipt",
        type: SchemaType.ARRAY,
        items: {
          type: SchemaType.OBJECT,
          properties: {
            name: { type: SchemaType.STRING },
            quantity: { type: SchemaType.NUMBER },
            unitPrice: { type: SchemaType.NUMBER },
            totalPrice: { type: SchemaType.NUMBER }
          },
          required: ["name", "quantity", "unitPrice", "totalPrice"]
        }
      },
      summary: {
        description: "Summary of charges",
        type: SchemaType.OBJECT,
        properties: {
          subtotal: { type: SchemaType.NUMBER },
          serviceCharge: { type: SchemaType.NUMBER },
          serviceTax: { type: SchemaType.NUMBER },
          total: { type: SchemaType.NUMBER },
          paymentMethod: { type: SchemaType.STRING }
        },
        required: ["subtotal", "total"]
      },
      additionalNotes: {
        description: "Additional notes or uncertainties",
        type: SchemaType.ARRAY,
        items: { type: SchemaType.STRING }
      }
    },
    required: ["metadata", "items", "summary"]
  };

  private static readonly RECEIPT_PROMPT = `Extract the receipt information and return it in JSON format. Follow these rules:
1. Extract all items with their quantities and prices
2. Verify all calculations are correct
3. Include any uncertainties in additionalNotes
4. Format dates as YYYY-MM-DD
5. Format times as HH:MM
6. Extract service charge and service tax into summary.serviceCharge and summary.serviceTax
7. If service charge or tax is already included in the total price, set summary.taxesIncluded to true
8. Return ONLY valid JSON, no other text
9. Double check JSON before submitting`;

  constructor(config: Partial<GeminiConfig> = {}) {
    const apiKey = "AIzaSyAaTzA3huvehjsUzwDieOd_k74ipLPWIe4";
    if (!apiKey) {
      throw new Error("Gemini API key is required");
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    this.model = genAI.getGenerativeModel({ 
      model: config.modelName || GeminiImageProcessor.DEFAULT_MODEL,
      generationConfig: {
        temperature: 0.1,
        topP: 0.1,
        topK: 16,
        maxOutputTokens: 2048,
        responseMimeType: "application/json",
        responseSchema: GeminiImageProcessor.RESPONSE_SCHEMA,
      }
    });
  }

  async processImageFile(
    filePath: string, 
    options: ImageProcessingOptions
  ): Promise<GeminiResponse> {
    try {
      const imageData = await fs.readFile(filePath);
      return await this.processImageBuffer(imageData, options);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async processImageBuffer(
    imageBuffer: Buffer, 
    options: ImageProcessingOptions
  ): Promise<GeminiResponse> {
    try {
      const prompt = options.prompt || GeminiImageProcessor.RECEIPT_PROMPT;

      const result = await this.model.generateContent([
        {
          inlineData: {
            data: imageBuffer.toString("base64"),
            mimeType: options.mimeType
          }
        },
        prompt
      ], {
        // generationConfig: {
        //   temperature: 0.1,
        //   topP: 0.1,
        //   topK: 16,
        //   maxOutputTokens: 2048
        // }
      });

      const response = await result.response;
      const text = response.text();
      // console.log(typeof(text));
      
      try {
        const parsedData = JSON.parse(text) as ReceiptData;
        return {
          text,
          parsedData: {
            ...parsedData,
            items: parsedData.items.map(item => ({
              ...item,
              quantity: item.quantity.toString(),
              unitPrice: item.unitPrice.toString(),
              totalPrice: item.totalPrice.toString()
            })),
            summary: {
              ...parsedData.summary,
              subtotal: parsedData.summary.subtotal.toString(),
              tax: parsedData.summary.tax?.toString(),
              tip: parsedData.summary.tip?.toString(),
              total: parsedData.summary.total.toString()
            }
          }
        };
      } catch (parseError) {
        return {
          text,
          error: 'Failed to parse response as JSON',
          parsedData: null
        };
      }
    } catch (error) {
      return this.handleError(error);
    }
  }

  async processImageUrl(
    imageUrl: string, 
    options: ImageProcessingOptions
  ): Promise<GeminiResponse> {
    try {
      const response = await fetch(imageUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch image: ${response.statusText}`);
      }
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      return await this.processImageBuffer(buffer, options);
    } catch (error) {
      return this.handleError(error);
    }
  }

  private handleError(error: unknown): GeminiResponse {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    console.error('Gemini processing error:', errorMessage);
    return {
      text: '',
      error: errorMessage,
      parsedData: null
    };
  }
}
