import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

/** Named, atomically incremented sequences (customer ids, employee ids, account serials). */
@Schema({ collection: 'counters', versionKey: false })
export class Counter {
  @Prop({ type: String, required: true })
  _id: string;

  @Prop({ type: Number, default: 0 })
  seq: number;
}

export const CounterSchema = SchemaFactory.createForClass(Counter);
