import EventEmitter from 'events';
import { DomainEvent } from '../domain/DomainEvent';
import { WebdavServerEventBus } from '../domain/WebdavServerEventBus';
import { DomainEventSubscribers } from './DomainEventSubscribers';

export class NodeJsEventBus
  extends EventEmitter
  implements WebdavServerEventBus
{
  async publish(events: Array<DomainEvent>): Promise<void> {
    events.forEach((event) => {
      this.emit(event.eventName, event);
    });
  }

  addSubscribers(subscribers: DomainEventSubscribers): void {
    subscribers.items.forEach((subscriber) => {
      subscriber.subscribedTo().forEach((event) => {
        this.on(`webdav.${event.EVENT_NAME}`, subscriber.on.bind(subscriber));
      });
    });
  }
}
