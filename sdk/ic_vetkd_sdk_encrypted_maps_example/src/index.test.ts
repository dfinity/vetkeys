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
  const vetkey = await encrypted_maps.getDerivedKeyMaterial(owner, "some key");
  const second_vetkey = await encrypted_maps.getDerivedKeyMaterial(owner, "some key");
  expect(isEqualArrayThrowing(
    vetkey.encryptMessage("message", "domain"), second_vetkey.encryptMessage("message", "domain")
  )).to.equal(true);
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
  const decrypted_ciphertext = await encrypted_maps.decrypt_for(owner, "some map", "some key", encryption_result);
  expect(isEqualArrayThrowing(plaintext, decrypted_ciphertext)).to.equal(true);
});

test('cannot get unauthorized vetkey', async () => {
  const [id0, id1] = ids();
  const encrypted_maps = await new_encrypted_maps(id0);
  expect(encrypted_maps.getDerivedKeyMaterial(id1.getPrincipal(), "some key")).rejects.toThrow(Error("unauthorized"));
});

test('can share a key', async () => {
  const [id0, id1] = ids();
  const owner = id0.getPrincipal();
  const user = id1.getPrincipal();
  const encrypted_maps_owner = await new_encrypted_maps(id0);
  const encrypted_maps_user = await new_encrypted_maps(id1);

  expect("Ok" in await encrypted_maps_owner.remove_user(owner, "some_key", user));

  const rights = { 'ReadWrite': null };
  expect((await encrypted_maps_owner.set_user_rights(owner, "some key", user, rights))["Ok"]).to.deep.equal([]);

  expect(encrypted_maps_user.getDerivedKeyMaterial(owner, "some key")).resolves.toBeTypeOf('object');
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

  await encrypted_maps.set_value(owner, map_name, map_key, plaintext);

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

  expect(expected_encryption_result.length).to.equal(12 + 16 + plaintext.length);
  expect(get_value_result.Ok[0].inner.length).to.equal(12 + 16 + plaintext.length);

  const try_decrypt_from_check = await encrypted_maps.decrypt_for(owner, map_name, map_key, Uint8Array.from(expected_encryption_result));
  expect(isEqualArrayThrowing(try_decrypt_from_check, plaintext)).to.equal(true);

  const try_decrypt_from_canister = await encrypted_maps.decrypt_for(owner, map_name, map_key, Uint8Array.from(get_value_result.Ok[0].inner));
  expect(isEqualArrayThrowing(try_decrypt_from_canister, plaintext)).to.equal(true);
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

  expect(set_value_result).toBeFalsy();

  const get_value_result = await encrypted_maps.get_value(owner, "some map", "some key");

  expect(isEqualArrayThrowing(value, get_value_result)).to.equal(true);
});

test('get-set roundtrip should be consistent', async () => {
  const id = randomId();
  const encrypted_maps = await new_encrypted_maps(id);
  const owner = id.getPrincipal();
  const data = new TextEncoder().encode("Hello, world!");

  await encrypted_maps.set_value(owner, "some map", "some key", data);
  const result = await encrypted_maps.get_value(owner, "some map", "some key");
  expect(isEqualArrayThrowing(data, result)).toBeTruthy();
});

test('sharing rights are consistent', async () => {
  const [id0, id1] = ids();
  const owner = id0.getPrincipal();
  const user = id1.getPrincipal();
  const key_manager_owner = await new_encrypted_maps(id0).catch((err) => { throw err; });
  const key_manager_user = await new_encrypted_maps(id1).catch((err) => { throw err; });
  const rights = { 'ReadWrite': null };

  expect((await key_manager_owner.set_user_rights(owner, "some key", user, rights))["Ok"]).to.deep.equal([]);
  expect((await key_manager_user.get_user_rights(owner, "some key", user))["Ok"]).to.deep.equal([rights]);
});

function isEqualArrayThrowing(a, b) {
  if (a.length != b.length) throw new Error("Arrays have different lengths");
  for (let i = 0; i < a.length; i++) { if (a[i] != b[i]) throw new Error("Arrays are not equal\n\na: " + a + "\n\nb:" + b); }
  return true;
}
