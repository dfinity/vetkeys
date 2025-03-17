export const idlFactory = ({ IDL }) => {
  const ByteBuf = IDL.Record({ 'inner' : IDL.Vec(IDL.Nat8) });
  const PasswordMetadata = IDL.Record({
    'url' : IDL.Text,
    'number_of_modifications' : IDL.Nat64,
    'tags' : IDL.Vec(IDL.Text),
    'last_modification_date' : IDL.Nat64,
    'last_modified_principal' : IDL.Principal,
    'creation_date' : IDL.Nat64,
  });
  const Result = IDL.Variant({
    'Ok' : IDL.Vec(IDL.Tuple(ByteBuf, ByteBuf, PasswordMetadata)),
    'Err' : IDL.Text,
  });
  const Result_1 = IDL.Variant({ 'Ok' : ByteBuf, 'Err' : IDL.Text });
  const Result_2 = IDL.Variant({ 'Ok' : IDL.Vec(ByteBuf), 'Err' : IDL.Text });
  const AccessRights = IDL.Variant({
    'Read' : IDL.Null,
    'ReadWrite' : IDL.Null,
    'ReadWriteManage' : IDL.Null,
  });
  const Result_3 = IDL.Variant({
    'Ok' : IDL.Vec(IDL.Tuple(IDL.Principal, AccessRights)),
    'Err' : IDL.Text,
  });
  const Result_4 = IDL.Variant({
    'Ok' : IDL.Opt(AccessRights),
    'Err' : IDL.Text,
  });
  const Result_5 = IDL.Variant({
    'Ok' : IDL.Opt(IDL.Tuple(ByteBuf, PasswordMetadata)),
    'Err' : IDL.Text,
  });
  return IDL.Service({
    'get_accessible_shared_map_names' : IDL.Func(
        [],
        [IDL.Vec(IDL.Tuple(IDL.Principal, ByteBuf))],
        ['query'],
      ),
    'get_encrypted_values_for_map_with_metadata' : IDL.Func(
        [IDL.Principal, ByteBuf],
        [Result],
        ['query'],
      ),
    'get_encrypted_vetkey' : IDL.Func(
        [IDL.Principal, ByteBuf, ByteBuf],
        [Result_1],
        [],
      ),
    'get_owned_non_empty_map_names' : IDL.Func([], [Result_2], ['query']),
    'get_shared_user_access_for_map' : IDL.Func(
        [IDL.Principal, ByteBuf],
        [Result_3],
        ['query'],
      ),
    'get_user_rights' : IDL.Func(
        [IDL.Principal, ByteBuf, IDL.Principal],
        [Result_4],
        ['query'],
      ),
    'get_vetkey_verification_key' : IDL.Func([], [ByteBuf], []),
    'insert_encrypted_value_with_metadata' : IDL.Func(
        [IDL.Principal, ByteBuf, ByteBuf, ByteBuf, IDL.Vec(IDL.Text), IDL.Text],
        [Result_5],
        [],
      ),
    'remove_encrypted_value_with_metadata' : IDL.Func(
        [IDL.Principal, ByteBuf, ByteBuf],
        [Result_5],
        [],
      ),
    'remove_user' : IDL.Func(
        [IDL.Principal, ByteBuf, IDL.Principal],
        [Result_4],
        [],
      ),
    'set_user_rights' : IDL.Func(
        [IDL.Principal, ByteBuf, IDL.Principal, AccessRights],
        [Result_4],
        [],
      ),
  });
};
export const init = ({ IDL }) => { return []; };
