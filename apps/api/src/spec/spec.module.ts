import { Module } from '@nestjs/common';
import { SpecParserService } from './spec-parser.service';
import { SpecValidatorService } from './spec-validator.service';

@Module({
  providers: [SpecParserService, SpecValidatorService],
  exports: [SpecParserService, SpecValidatorService],
})
export class SpecModule {}
