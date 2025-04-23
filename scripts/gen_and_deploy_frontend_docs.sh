IDENTITY=$1

./gen_frontend_docs.sh
dfx deploy --ic --identity $IDENTITY --mode reinstall docs
