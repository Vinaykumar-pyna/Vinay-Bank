import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import {
  CARD_RPC,
  type CardAuthorizeRequest,
  type CardAuthorizeResponse,
  type CardReverseRequest,
  type CardReverseResponse,
} from '@app/shared';
import { CardAuthorizationService } from './card-authorization.service';

/**
 * Issuer endpoint for the card switch: NestJS microservice message handlers on
 * a mutual-TLS TCP listener (see card-network.setup.ts). Only clients holding a
 * certificate from our CA can connect, so no JWT is involved here.
 */
@Controller()
export class CardNetworkController {
  constructor(private readonly authorization: CardAuthorizationService) {}

  @MessagePattern(CARD_RPC.AUTHORIZE)
  authorize(@Payload() request: CardAuthorizeRequest): Promise<CardAuthorizeResponse> {
    return this.authorization.authorize(request);
  }

  @MessagePattern(CARD_RPC.REVERSE)
  reverse(@Payload() request: CardReverseRequest): Promise<CardReverseResponse> {
    return this.authorization.reverse(request);
  }
}
