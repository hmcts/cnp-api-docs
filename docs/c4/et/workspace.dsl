workspace {
    model {
        !include ../hmcts.mdsl
    }

    views {
        !include ../hmcts.vdsl

        systemContext et "et-context" {
            include *
            exclude idam
            exclude rpe
            exclude relationship==bsp->*
            autoLayout
        }

        container et "et-overview" {
            include *
            exclude idam
            exclude rpe
            exclude relationship==bsp->*
            autoLayout
        }
    }
}
