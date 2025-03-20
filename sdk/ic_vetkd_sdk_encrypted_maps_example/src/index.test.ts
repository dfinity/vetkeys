import { HttpAgent } from "@dfinity/agent";
import { DefaultEncryptedMapsClient } from "./index";
import { expect, test } from 'vitest'
import fetch from 'isomorphic-fetch';
import { Ed25519KeyIdentity } from "@dfinity/identity";
import { EncryptedMaps } from "ic_vetkd_sdk_encrypted_maps/src";
import { randomBytes } from 'node:crypto'

function randomId(): Ed25519KeyIdentity {
  return Ed25519KeyIdentity.generate(randomBytes(32));
}

function ids(): [Ed25519KeyIdentity, Ed25519KeyIdentity] {
  return [randomId(), randomId()];
}

async function new_encrypted_maps(id: Ed25519KeyIdentity): Promise<EncryptedMaps> {
  const host = 'http://localhost:8000';
  const agent = await HttpAgent.create({ fetch, host, identity: id, shouldFetchRootKey: true });
  const canisterId = process.env.CANISTER_ID_ENCRYPTED_MAPS_EXAMPLE as string;
  return new EncryptedMaps(new DefaultEncryptedMapsClient(agent, canisterId));
}

test('get_accessible_shared_map_names', async () => {
  const id = randomId();
  const encrypted_maps = await new_encrypted_maps(id);
  const names = await encrypted_maps.get_accessible_shared_map_names();
  expect(names.length === 0).toBeTruthy();
});

test('can get vetkey', async () => {
  const id = randomId();
  const encrypted_maps = await new_encrypted_maps(id);
  const owner = id.getPrincipal();
  const vetkey = await encrypted_maps.get_symmetric_vetkey(owner, "some key");
  expect('Ok' in vetkey).to.equal(true);
  // no trivial key output
  expect(isEqualArray(vetkey["Ok"].inner, new Uint8Array(16))).to.equal(false);

  const second_vetkey = await encrypted_maps.get_symmetric_vetkey(owner, "some key");
  expect(isEqualArray(vetkey["Ok"].inner, second_vetkey["Ok"].inner)).to.equal(true);
});

test('vetkey encryption roundtrip', async () => {
  const id = randomId();
  const encrypted_maps = await new_encrypted_maps(id);
  const owner = id.getPrincipal();
  const plaintext = Uint8Array.from([1, 2, 3, 4]);

  const encryption_result = await encrypted_maps.encrypt_for(owner, "some map", "some key", plaintext);
  if ("Err" in encryption_result) {
    return encryption_result;
  }
  const decrypted_ciphertext = await encrypted_maps.decrypt_for(owner, "some map", "some key", encryption_result.Ok);
  if ("Err" in decrypted_ciphertext) {
    throw new Error("Failed to decrypt ciphertext");
  }
  if (decrypted_ciphertext.Ok.length === 0) {
    throw new Error("empty result");
  }
  expect(isEqualArray(plaintext, decrypted_ciphertext.Ok)).to.equal(true);
});

test('cannot get unauthorized vetkey', async () => {
  const [id0, id1] = ids();
  const encrypted_maps = await new_encrypted_maps(id0);
  expect((await encrypted_maps.get_symmetric_vetkey(id1.getPrincipal(), "some key"))["Err"]).to.equal("unauthorized");
});

test('can share a key', async () => {
  const [id0, id1] = ids();
  const owner = id0.getPrincipal();
  const user = id1.getPrincipal();
  const encrypted_maps_owner = await new_encrypted_maps(id0);
  const encrypted_maps_user = await new_encrypted_maps(id1);
  const vetkey_owner = await encrypted_maps_owner.get_symmetric_vetkey(owner, "some key");

  expect("Ok" in await encrypted_maps_owner.remove_user(owner, "some_key", user));

  const rights = { 'ReadWrite': null };
  expect((await encrypted_maps_owner.set_user_rights(owner, "some key", user, rights))["Ok"]).to.deep.equal([]);

  const vetkey_user = await encrypted_maps_user.get_symmetric_vetkey(owner, "some key");

  expect(isEqualArray(vetkey_owner["Ok"].inner, vetkey_user["Ok"].inner)).to.equal(true);
});

test('set value should work', async () => {
  const id = randomId();
  const encrypted_maps = await new_encrypted_maps(id);
  const owner = id.getPrincipal();
  const plaintext = new TextEncoder().encode("Hello, world!");
  const map_key = "some key";
  const map_name = "some map";

  const remove_result = encrypted_maps.remove_encrypted_value(owner, map_name, map_key);
  if ("Err" in remove_result) {
    throw new Error("Failed to remove map key: " + remove_result.Err);
  }

  const set_value_result = await encrypted_maps.set_value(owner, map_name, map_key, plaintext);
  if ("Err" in set_value_result) {
    throw new Error(set_value_result.Err);
  }

  if ("Ok" in set_value_result && set_value_result.Ok.length === 0) {
    // all good ...
  } else {
    throw new Error("set_value returned non-empty array");
  }

  const expected_encryption_result = await encrypted_maps.encrypt_for(owner, map_name, map_key, plaintext);
  if ("Err" in expected_encryption_result) {
    return expected_encryption_result;
  }

  const get_value_result = await encrypted_maps.canister_client.get_encrypted_value(owner, map_name, map_key);
  if ("Err" in get_value_result) {
    throw new Error(get_value_result.Err);
  }
  if (get_value_result.Ok.length === 0) {
    throw new Error("empty result");
  }

  expect(expected_encryption_result.Ok.length).to.equal(12 + 16 + plaintext.length);
  expect(get_value_result.Ok[0].inner.length).to.equal(12 + 16 + plaintext.length);

  const try_decrypt_from_check = await encrypted_maps.decrypt_for(owner, map_name, map_key, Uint8Array.from(expected_encryption_result.Ok));
  if ("Err" in try_decrypt_from_check) {
    throw new Error("Failed to decrypt from check: " + try_decrypt_from_check.Err);
  }
  if (try_decrypt_from_check.Ok.length === 0) {
    throw new Error("empty result");
  }
  expect(isEqualArray(try_decrypt_from_check.Ok, plaintext)).to.equal(true);

  const try_decrypt_from_canister = await encrypted_maps.decrypt_for(owner, map_name, map_key, Uint8Array.from(get_value_result.Ok[0].inner));
  if ("Err" in try_decrypt_from_canister) {
    throw new Error("Failed to decrypt from check: " + try_decrypt_from_canister.Err);
  }
  if (try_decrypt_from_canister.Ok.length === 0) {
    throw new Error("empty result");
  }
  expect(isEqualArray(try_decrypt_from_canister.Ok, plaintext)).to.equal(true);
});

test('get value should work', async () => {
  const id = randomId();
  const encrypted_maps = await new_encrypted_maps(id);
  const owner = id.getPrincipal();

  const remove_result = encrypted_maps.remove_encrypted_value(owner, "some map", "some key");
  if ("Err" in remove_result) {
    throw new Error("Failed to remove map key: " + remove_result.Err);
  }

  const value = new TextEncoder().encode("Hello, world!");

  const set_value_result = await encrypted_maps.set_value(owner, "some map", "some key", value);

  expect("Ok" in set_value_result).to.equal(true);

  const get_value_result = await encrypted_maps.get_value(owner, "some map", "some key");

  if ("Err" in get_value_result) {
    throw new Error(get_value_result.Err);
  }

  if ("Ok" in get_value_result && get_value_result.Ok.length === 0) {
    throw new Error("get_value returned empty array");
  }

  expect(isEqualArray(value, get_value_result.Ok)).to.equal(true);
});

test('get-set roundtrip should be consistent', async () => {
  const id = randomId();
  const encrypted_maps = await new_encrypted_maps(id);
  const owner = id.getPrincipal();
  const data = new TextEncoder().encode("Hello, world!");

  await encrypted_maps.set_value(owner, "some map", "some key", data);
  const result = await encrypted_maps.get_value(owner, "some map", "some key");
  if ("Err" in result) {
    throw new Error(result.Err);
  }
  if (result.Ok.length === 0) {
    throw new Error("empty result");
  }
  expect(result.Ok).to.deep.equal(data);
});

// test('sharing rights are consistent', async () => {
//   let owner = id0.getPrincipal();
//   let user = id1.getPrincipal();
//   let encrypted_maps_owner = new_encrypted_maps(id0);
//   let encrypted_maps_user = new_encrypted_maps(id1);
//   let rights = { 'ReadWrite': null };

//   expect((await encrypted_maps_user.get_user_rights(owner, "some key", owner))["Ok"]).to.deep.equal([{ 'ReadWriteManage': null }]);

//   expect((await encrypted_maps_owner.set_user_rights(owner, "some key", user, rights))["Ok"]).to.deep.equal([rights]);
//   expect((await encrypted_maps_user.get_user_rights(owner, "some key", user))["Ok"]).to.deep.equal([rights]);
// });

function isEqualArray(a, b) {
  if (a.length != b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] != b[i]) return false; return true;
}
