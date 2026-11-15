import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { ClientSession, Model } from 'mongoose';
import { Counter } from './counter.schema';

@Injectable()
export class CountersService {
  constructor(@InjectModel(Counter.name) private readonly counters: Model<Counter>) {}

  /**
   * Returns the next value of a sequence. `$inc` with upsert is atomic, so two
   * concurrent requests can never receive the same number.
   */
  async next(name: string, session?: ClientSession): Promise<number> {
    const counter = await this.counters
      .findOneAndUpdate(
        { _id: name },
        { $inc: { seq: 1 } },
        { upsert: true, new: true, session, setDefaultsOnInsert: true },
      )
      .lean();
    return counter.seq;
  }
}
