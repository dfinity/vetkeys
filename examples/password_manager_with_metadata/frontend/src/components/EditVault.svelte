<script lang="ts">
    import { Editor, placeholder } from "typewriter-editor";
    import { type VaultModel } from "../lib/vault";
    import { vaultsStore, refreshVaults } from "../store/vaults";
    import Header from "./Header.svelte";
    import SharingEditor from "./SharingEditor.svelte";
    import Trash from "svelte-icons/fa/FaTrash.svelte";
    import { addNotification, showError } from "../store/notifications";
    import { auth } from "../store/auth";
    import Spinner from "./Spinner.svelte";

    export let currentRoute = "";

    let editedVault: VaultModel;
    let editor: Editor;
    let updating = false;
    let deleting = false;
    let canManage;

    async function save() {
        if ($auth.state !== "initialized") {
            return;
        }
        const html = editor.getText();
        updating = true;

        addNotification({
            type: "success",
            message: "Vault saved successfully",
        });

        await refreshVaults(
            $auth.client.getIdentity().getPrincipal(),
            $auth.passwordManager,
        ).catch((e) => showError(e, "Could not refresh notes."));
    }

    function deleteVault() {}

    $: {
        if (
            $auth.state === "initialized" &&
            $vaultsStore.state === "loaded" &&
            !editedVault
        ) {
            const vault = $vaultsStore.list.find(
                (vault) => vault.name === currentRoute,
            );

            if (vault) {
                editedVault = { ...vault };
                editor = new Editor({
                    modules: {
                        placeholder: placeholder("Start typing..."),
                    },
                });
                const me = $auth.client.getIdentity().getPrincipal();
                canManage =
                    vault.owner.compareTo(me) === "eq" ||
                    "ReadWriteManage" in
                        vault.users.find(([p, r]) => p.compareTo(me) === "eq");
            }
        }
    }
</script>

{#if editedVault}
    <Header>
        <span slot="title"> Edit vault </span>
        <button
            slot="actions"
            class="btn btn-ghost {deleting ? 'loading' : ''} {!canManage
                ? 'hidden'
                : ''}"
            on:click={deleteVault}
            disabled={updating || deleting}
        >
            {#if !deleting}
                <span class="w-6 h-6 p-1"><Trash /></span>
            {/if}

            {deleting ? "Deleting..." : ""}
        </button>
    </Header>
    <main class="p-4">
        {#if $vaultsStore.state === "loaded"}
            <hr class="mt-10" />
            <SharingEditor {editedVault} {canManage} />
        {:else if $vaultsStore.state === "loading"}
            Loading vaults...
        {/if}
    </main>
{:else}
    <Header>
        <span slot="title"> Edit vault </span>
    </Header>
    <main class="p-4">
        {#if $vaultsStore.state === "loading"}
            <Spinner />
            Loading vault...
        {:else if $vaultsStore.state === "loaded"}
            <div class="alert alert-error">Could not find vault.</div>
        {/if}
    </main>
{/if}
