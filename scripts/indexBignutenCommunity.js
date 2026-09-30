'use strict';

const { Contract, JsonRpcProvider } = require('ethers');
const { readFile, writeFile } = require('node:fs/promises');

const ABI = [
  'event CommunityDataPublished(uint256 indexed shareId,address indexed publisher,string cid,bytes32 contentHash,uint256 publishedAt)',
  'event NodeRegistered(uint256 indexed nodeId,address indexed operator,bytes32 nodeDidHash,bytes32 peerIdHash,string softwareVersion)',
  'event NodeCheckRecorded(uint256 indexed nodeId,uint256 indexed month,address indexed checker,bytes32 challengeHash,bytes32 sampleProofHash,uint256 sampleCount,uint256 timestamp)',
  'event MonthlyNodeRewardRecorded(uint256 indexed nodeId,uint256 indexed month,address indexed operator,uint256 amount,bytes32 paymentReference)',
];

async function main() {
  const registryAddress = String(process.env.BIGNUTEN_NETWORK_REGISTRY_ADDRESS || '').trim();
  if (!registryAddress) throw new Error('BIGNUTEN_NETWORK_REGISTRY_ADDRESS is required');
  const provider = new JsonRpcProvider(process.env.BASE_RPC_URL || 'https://mainnet.base.org', 8453);
  const registry = new Contract(registryAddress, ABI, provider);
  const fromBlock = Number(process.env.BIGNUTEN_NETWORK_FROM_BLOCK || 0);
  const toBlock = await provider.getBlockNumber();
  const shares = await registry.queryFilter(registry.filters.CommunityDataPublished(), fromBlock, toBlock);
  const nodes = await registry.queryFilter(registry.filters.NodeRegistered(), fromBlock, toBlock);
  const checks = await registry.queryFilter(registry.filters.NodeCheckRecorded(), fromBlock, toBlock);
  const rewards = await registry.queryFilter(registry.filters.MonthlyNodeRewardRecorded(), fromBlock, toBlock);
  const index = {
    generatedAt: new Date().toISOString(),
    registry: registryAddress,
    fromBlock,
    toBlock,
    shares: shares.map(log => ({
      shareId: log.args.shareId.toString(),
      publisher: log.args.publisher,
      cid: log.args.cid,
      contentHash: log.args.contentHash,
      publishedAt: log.args.publishedAt.toString(),
    })),
    nodes: nodes.map(log => ({
      nodeId: log.args.nodeId.toString(),
      operator: log.args.operator,
      nodeDidHash: log.args.nodeDidHash,
      peerIdHash: log.args.peerIdHash,
      softwareVersion: log.args.softwareVersion,
    })),
    checks: checks.map(log => ({
      nodeId: log.args.nodeId.toString(),
      month: log.args.month.toString(),
      checker: log.args.checker,
      sampleProofHash: log.args.sampleProofHash,
      sampleCount: log.args.sampleCount.toString(),
      timestamp: log.args.timestamp.toString(),
    })),
    rewards: rewards.map(log => ({
      nodeId: log.args.nodeId.toString(),
      month: log.args.month.toString(),
      operator: log.args.operator,
      amount: log.args.amount.toString(),
      paymentReference: log.args.paymentReference,
    })),
  };
  const output = process.env.BIGNUTEN_COMMUNITY_INDEX || 'bignuten-community-index.json';
  await writeFile(output, `${JSON.stringify(index, null, 2)}\n`);
  console.log(`Indexed ${index.shares.length} shares, ${index.nodes.length} nodes, ${index.checks.length} checks, and ${index.rewards.length} rewards.`);
}

if (require.main === module) main().catch(error => { console.error(error.stack || error.message); process.exitCode = 1; });

module.exports = { main };
