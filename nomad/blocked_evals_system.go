package nomad

import "github.com/hashicorp/nomad/nomad/structs"

// systemEvals are handled specially, each job may have a blocked eval on each node
type systemEvals struct {
	// job maps a single blocked eval on each node for each job
	job map[structs.NamespacedID]map[string]*structs.Evaluation

	// node maps a node id to the set of all blocked evals, mapped to their authentication tokens
	// node map[string]map[*structs.Evaluation]string
	node map[string]map[string]*wrappedEval
}

func newSystemEvals() *systemEvals {
	return &systemEvals{
		job: map[structs.NamespacedID]map[string]*structs.Evaluation{},
		// node: map[string]map[*structs.Evaluation]string{},
		node: map[string]map[string]*wrappedEval{},
	}
}

// setSystemEval creates the inner map if necessary
func (b *BlockedEvals) setSystemEval(eval *structs.Evaluation, token string) {
	// store the eval by node id
	if _, ok := b.system.node[eval.NodeID]; !ok {
		// b.system.node[eval.NodeID] = make(map[*structs.Evaluation]string)
		b.system.node[eval.NodeID] = make(map[string]*wrappedEval)
	}
	b.system.node[eval.NodeID][eval.ID] = &wrappedEval{eval: eval, token: token}

	// link the job to the node for cleanup
	jobID := structs.NewNamespacedID(eval.JobID, eval.Namespace)
	if _, ok := b.system.job[jobID]; !ok {
		b.system.job[jobID] = make(map[string]*structs.Evaluation)
	}

	// if we're displacing the old blocked id for this node, clean delete it first
	if prev, ok := b.system.job[jobID][eval.NodeID]; ok {
		b.delSystemEval(prev)
	}

	// set this eval as the new eval for this job on this node
	b.system.job[jobID][eval.NodeID] = eval
}

// delSystemEval deletes a blocked system eval
func (b *BlockedEvals) delSystemEval(eval *structs.Evaluation) {
	// delete the job index iff this eval is the currently listed blocked eval
	jobID := structs.NewNamespacedID(eval.JobID, eval.Namespace)
	e, ok := b.system.job[jobID][eval.NodeID]
	if ok && e.ID == eval.ID {
		delete(b.system.job[jobID], eval.NodeID)
	}

	// if we're deleting from system.node, decrement stats
	if _, ok = b.system.node[eval.NodeID][eval.ID]; ok {
		b.stats.TotalBlocked--
		if len(b.system.node[eval.NodeID]) == 1 {
			delete(b.system.node, eval.NodeID)
		} else {
			delete(b.system.node[eval.NodeID], eval.ID)
		}
	}
}

// getSystemEvals returns the set of blocked evals for namespaced job
func (b *BlockedEvals) getSystemEvals(jobID structs.NamespacedID) []*structs.Evaluation {
	var out []*structs.Evaluation
	for _, e := range b.system.job[jobID] {
		out = append(out, e)
	}
	return out
}
