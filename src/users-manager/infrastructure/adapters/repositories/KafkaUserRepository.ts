/*
 in contrast to a KStream (change-log topic representation)
 a KTable is a table like representation of a topic,
 meaning only the last value of a key will be present in the table.

 the input topic could look like this:

 "fruit banana"
 "fruit cherry"
 "vegetable broccoli"
 "fruit strawberry"
 "vegetable lettuce"

 the output topic would then look like this:

 "fruit strawberry",
 "vegetable lettuce"
*/

//@ts-ignore
import { KafkaStreams } from 'kafka-streams';

const kafkaStreams = new KafkaStreams({
  noptions: {
    'metadata.broker.list': 'localhost:9092',
    'group.id': 'kafka-streams-test-native',
    'client.id': 'kafka-streams-test-name-native',
    event_cb: true,
    'compression.codec': 'snappy',
    'api.version.request': true,
    'socket.keepalive.enable': true,
    'socket.blocking.max.ms': 100,
    'enable.auto.commit': false,
    'auto.commit.interval.ms': 100,
    'heartbeat.interval.ms': 250,
    'retry.backoff.ms': 250,
    'fetch.min.bytes': 100,
    'fetch.message.max.bytes': 2 * 1024 * 1024,
    'queued.min.messages': 100,
    'fetch.error.backoff.ms': 100,
    'queued.max.messages.kbytes': 50,
    'fetch.wait.max.ms': 1000,
    'queue.buffering.max.ms': 1000,
    'batch.num.messages': 10000,
  },
  tconf: {
    'auto.offset.reset': 'earliest',
    'request.required.acks': 1,
  },
  batchOptions: {
    batchSize: 5,
    commitEveryNBatch: 1,
    concurrency: 1,
    commitSync: false,
    noBatchCommits: false,
  },
});

//@ts-ignore
kafkaStreams.on('error', error => {
  console.log('Error occured:', error.message);
});

//creating a ktable requires a function that can be
//used to turn the kafka messages into key-value objects
//as tables can only be built on key-value pairs
const table = kafkaStreams.getKTable('User', keyValueMapperEtl);

//@ts-ignore
function keyValueMapperEtl(kafkaMessage) {
  const value = kafkaMessage.value.toString('utf8');
  const elements = value.toLowerCase().split(' ');
  console.log('keyValueMapperEtl', elements[0], elements[1]);
  return {
    key: elements[0],
    value: elements[1],
  };
}

//consume the first 100 messages on the topic to build the table
// table
//   .consumeUntilCount(10, () => {
//     console.log('aaa');
//     //fires when 100 messages are consumed
//
//     //the table has been built, there are two ways
//     //to access the content now
//
//     //@ts-ignore 1. as map object
//     table.getTable().then(map => {
//       console.log(map.fruit); //will log "strawberry"
//     });
//
//     //@ts-ignore 2. as replayed stream
//     table.forEach(row => {
//       console.log(row);
//     });
//
//     //you can replay as often as you like
//     //replay will simply place every key-value member
//     //of the internal map onto the stream once again
//     table.replay();
//
//     //kafka consumer will be closed automatically
//   })
//   //be aware that any operator you append during this runtime
//   //will apply for any message that is on the stream (in change-log behaviour)
//   //you have to consume the topic first, for it to be present as table
//   .atThroughput(5, () => {
//     //fires once when 50 messages are consumed
//     console.log('consumed 50 messages.');
//   });
//
// //start the stream/table
//will emit messages as soon as
//kafka consumer is ready

table.start();
