export const idlFactory = ({ IDL }) => {
  const Signature = IDL.Record({
    'signature' : IDL.Vec(IDL.Nat8),
    'message' : IDL.Text,
    'timestamp' : IDL.Nat64,
  });
  return IDL.Service({
    'get_my_signatures' : IDL.Func([], [IDL.Vec(Signature)], ['query']),
    'get_my_verification_key' : IDL.Func([], [IDL.Vec(IDL.Nat8)], []),
    'sign_message' : IDL.Func([IDL.Text], [IDL.Vec(IDL.Nat8)], []),
  });
};
export const init = ({ IDL }) => { return [IDL.Text]; };
