# hypercore-protocol-modularized
A version of [hypercore-protocol](https://github.com/mafintosh/hypercore-protocol) with separate streams for encoding/decoding and feed management.

Useful for learning purposes (i.e. for inserting spies into the different stages) or for creating custom seeder services that can delegate replication to worker nodes, while terminating connections (and doing encoding/decoding) on large gateway nodes.
