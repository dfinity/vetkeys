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
    await second_vetkey.decryptMessage(await vetkey.encryptMessage("message", "domain"), "domain"),
    new TextEncoder().encode("message"),
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
  await expect(encrypted_maps.getDerivedKeyMaterial(id1.getPrincipal(), "some key")).rejects.toThrow(Error("unauthorized"));
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

  await expect(encrypted_maps_user.getDerivedKeyMaterial(owner, "some key")).resolves.toBeTypeOf('object');
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

test('can get user rights', async () => {
  const [id0, id1] = ids();
  const owner = id0.getPrincipal();
  const user = id1.getPrincipal();
  const encrypted_maps_owner = await new_encrypted_maps(id0);
  const encrypted_maps_user = await new_encrypted_maps(id1);
  const rights = { 'ReadWrite': null };

  await encrypted_maps_owner.set_value(owner, "some map", "some key", new TextEncoder().encode("Hello, world!"));
  const initialUserRights = await encrypted_maps_owner.get_user_rights(owner, "some key", owner);
  if ("Err" in initialUserRights) {
    throw new Error("Failed to get initial user rights");
  }
  expect(initialUserRights.Ok).to.deep.equal([{'ReadWriteManage': null}]);

  expect((await encrypted_maps_owner.get_user_rights(owner, "some key", user))["Ok"]).to.deep.equal([]);
  const setUserRightsResult = await encrypted_maps_owner.set_user_rights(owner, "some key", user, rights);
  if ("Err" in setUserRightsResult) {
    throw new Error(setUserRightsResult.Err);
  }
  expect(setUserRightsResult.Ok).to.deep.equal([]);
  expect((await encrypted_maps_user.get_user_rights(owner, "some key", user))["Ok"]).to.deep.equal([rights]);
});

test('get map values should work', async () => {
  const id = randomId();
  const encrypted_maps = await new_encrypted_maps(id);
  const owner = id.getPrincipal();
  const key1 = "some key 1";
  const key2 = "some key 2";
  const key3 = "some key 3";
  const data1 = new TextEncoder().encode("Hello, world 1!");
  const data2 = new TextEncoder().encode("Hello, world 2!");
  const data3 = new TextEncoder().encode("Hello, world 3!");
  const mapName = "some map";

  await encrypted_maps.set_value(owner, mapName, key1, data1);
  await encrypted_maps.set_value(owner, mapName, key2, data2);
  await encrypted_maps.set_value(owner, mapName, key3, data3);
  const result = await encrypted_maps.get_values_for_map(owner, mapName);
  if ("Err" in result) {
    throw new Error(result.Err);
  }
  if (result.Ok.length === 0) {
    throw new Error("empty result");
  }
  expect(result.Ok.length).to.equal(3);

  const mapValues: Array<Array<Uint8Array>> = result.Ok.map(
    (keyValue) => {
      return [Uint8Array.from(keyValue[0].inner), Uint8Array.from(keyValue[1].inner)]; 
    }
  );
  const expectedMapValues: Array<Array<Uint8Array>> = [
    [new TextEncoder().encode(key1), data1],
    [new TextEncoder().encode(key2), data2],
    [new TextEncoder().encode(key3), data3]
  ];
  expect(isEqual2dArrayIfSortedThrowing(mapValues, expectedMapValues)).to.toBeTruthy();
});

test("get all accessible values should work", async () => {
  const id = randomId();
  const encryptedMapsOwner = await new_encrypted_maps(id);
  const encryptedMapsSharesWithOwner = await new_encrypted_maps(id);
  const owner = id.getPrincipal();
  const sharesWithOwner = id.getPrincipal();
  const mapName1 = "some map 1";
  const mapName2 = "some map 2";
  const key1 = "some key 1";
  const key2 = "some key 2";
  const key3 = "some key 3";
  const key4 = "some key 4";
  const data1 = new TextEncoder().encode("Hello, world 1!");
  const data2 = new TextEncoder().encode("Hello, world 2!");
  const data3 = new TextEncoder().encode("Hello, world 3!");
  const data4 = new TextEncoder().encode("Hello, world 4!");

  await encryptedMapsOwner.set_value(owner, mapName1, key1, data1);
  await encryptedMapsOwner.set_value(owner, mapName1, key2, data2);
  await encryptedMapsSharesWithOwner.set_value(
    sharesWithOwner,
    mapName2,
    key3,
    data3
  );
  await encryptedMapsSharesWithOwner.set_value(
    sharesWithOwner,
    mapName2,
    key4,
    data4
  );

  await encryptedMapsSharesWithOwner.set_user_rights(
    sharesWithOwner,
    mapName2,
    owner,
    { Read: null }
  );

  const retrievedValues =
    await encryptedMapsOwner.get_all_accessible_values();

  // 2 maps
  expect(retrievedValues.length).to.equal(2);
  // 2 keys in the first map
  expect(retrievedValues[0][1].length).to.equal(2);
  // 2 keys in the second map
  expect(retrievedValues[1][1].length).to.equal(2);

  for (const [[ownerPrincipal, mapName], values] of retrievedValues) {
    const valuesConverted: Array<Array<Uint8Array>> = values.map(
      ([mapKey, value]) => {
        return [Uint8Array.from(mapKey.inner), Uint8Array.from(value.inner)];
      }
    );
    if (
      ownerPrincipal.compareTo(owner) === "eq" &&
      isEqualArray(
        Uint8Array.from(mapName.inner),
        new TextEncoder().encode(mapName1)
      )
    ) {
      const expectedValues: Array<Array<Uint8Array>> = [
        [new TextEncoder().encode(key1), data1],
        [new TextEncoder().encode(key2), data2],
      ];
      expect(
        isEqual2dArrayIfSortedThrowing(valuesConverted, expectedValues)
      ).to.toBeTruthy();
    } else if (
      ownerPrincipal.compareTo(sharesWithOwner) === "eq" &&
      isEqualArray(
        Uint8Array.from(mapName.inner),
        new TextEncoder().encode(mapName2)
      )
    ) {
      const expectedValues: Array<Array<Uint8Array>> = [
        [new TextEncoder().encode(key3), data3],
        [new TextEncoder().encode(key4), data4],
      ];
      expect(
        isEqual2dArrayIfSortedThrowing(valuesConverted, expectedValues)
      ).to.toBeTruthy();
    } else {
      throw new Error(
        "Unexpected map owner and name: " +
          ownerPrincipal +
          " " +
          new TextDecoder().decode(Uint8Array.from(mapName.inner)) +
          ". Expected were owner=" +
          owner +
          ", map=" +
          mapName1 +
          " and non-owner=" +
          sharesWithOwner +
          ", map=" +
          mapName2
      );
    }
  }
});

function isEqualArrayThrowing(a: Uint8Array, b: Uint8Array) {
  if (!isEqualArray(a,b)) { throw Error("Arrays not equal\n\na: " + a + "\n\nb: " + b); };
  return true;
}

function isEqualArray(a: Uint8Array, b: Uint8Array) : boolean {
  if (a.length != b.length) return false;
  for (let i = 0; i < a.length; i++) { if (a[i] != b[i]) return false; }
  return true;
}

function isEqual2dArrayIfSortedThrowing(a: Array<Array<Uint8Array>>, b: Array<Array<Uint8Array>>) : boolean {
  if (a.length != b.length) throw Error("Arrays not equal length\n\na: " + JSON.stringify(a) + "\n\nb: " + JSON.stringify(b));

  for (const [keyA, valueA] of a) {
    const isFound = b.find(([keyB, valueB]) => { return isEqualArray(keyA, keyB) && isEqualArray(valueA, valueB); } );
    if (!isFound) {
      throw Error("Arrays not equal\n\na: " + JSON.stringify(a) + "\n\nb: " + JSON.stringify(b));
    }
  }

  return true;
}
