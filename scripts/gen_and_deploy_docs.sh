IDENTITY=$1

./gen_docs.sh
dfx deploy --ic --identity $IDENTITY --mode reinstall docs
