import { BehaviorModel } from './BehaviorModel';
import { GenericBehavior } from './GenericBehavior';
import { ArticleReaderBehavior } from './ArticleReaderBehavior';
import { InfiniteScrollBehavior } from './InfiniteScrollBehavior';
import { FormFillerBehavior } from './FormFillerBehavior';

export class BehaviorFactory {
  static create(modelType: string): BehaviorModel {
    switch (modelType) {
      case 'article_reader':
        return new ArticleReaderBehavior();
      case 'infinite_scroll':
        return new InfiniteScrollBehavior();
      case 'form_filler':
        return new FormFillerBehavior();
      case 'generic':
      default:
        return new GenericBehavior();
    }
  }
}
