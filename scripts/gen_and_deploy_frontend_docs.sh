IDENTITY=$1

set -e

./gen_frontend_docs.sh
dfx deploy --ic --identity $IDENTITY --mode reinstall docs
