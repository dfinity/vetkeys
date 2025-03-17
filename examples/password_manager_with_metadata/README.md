# VetKD Password Manager with Medatadata

The `examples/password_manager` example uses the defaults provided by the devkit
to implement a VetKD-based password manager. This utilizes the encrypted maps
canister example to realize the password manager, i.e., there is no dedicated
canister implementation, only the frontend implementation that uses all defaults
from the SDK.

This example effectively extends the `examples/password_manager` example by
adding various metadata that are common in a real application: 1) metadata
created by the backend (password creation and last modification date, the
principal that last modified the password, and the total number of
modifications), and 2) metadata created by the frontend (password tags and URL).

To extend `examples/password_manager`, the following steps were done:
* Backend
  *  Manually define the canister APIs (i.e., cannot use the default canister implementation).
  *  And extend the canister APIs where metadata was passed along with the encrypted
     values (map key-value retrieval, insertion, and removal).
* Frontend
  * Use the default SDK implementation for the calls that are unaffected by the
    metadata (e.g., setting and getting the user rights).
  * Manually implement data insertion with metadata in atomic calls using the
    `dfx`-generated canister client code. Use the SDK implementation for
    encryption.
  * Modify the UI to handle the metadata. 

## Run `deploy_locally.sh` to deploy the canisters in a local IC environment. See `deploy_locally.sh` for more details about the deployment steps.
