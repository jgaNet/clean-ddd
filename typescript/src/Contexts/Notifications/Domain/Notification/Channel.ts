/** The ways a notification can reach someone. One infrastructure adapter per value (INotificationChannel). */
export enum Channel {
  WEBSOCKET = 'WEBSOCKET',
  EMAIL = 'EMAIL',
}

/** A name a client sent is a channel only if the domain knows it; the domain decides, not the schema. */
export const isChannel = (name: string): name is Channel => (Object.values(Channel) as string[]).includes(name);
