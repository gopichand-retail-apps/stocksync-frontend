import modelJson from '../../public/stocksync-model.json?raw';
import { contentModelSchema } from '../content-schema';

const parsedJson: unknown = JSON.parse(modelJson);
export const testContentModel = contentModelSchema.parse(parsedJson);
