/** External indices into pierron Light `remaining_accounts` (6 system + 4 trees). */
export const PIERRON_LIGHT_EXTERNAL_INDEX = Object.freeze({
  addressMerkleTree: 6,
  addressQueue: 7,
  stateQueue: 8,
  stateTree: 9,
});

/** Where compressed user outputs are written (state merkle tree). */
export const PIERRON_LIGHT_OUTPUT_TREE_INDEX = PIERRON_LIGHT_EXTERNAL_INDEX.stateTree;
